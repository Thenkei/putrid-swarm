"""Render the driveway wagon on a fixed body from its painted front and two sides.

Run from any directory with Python, NumPy and Pillow. Body stations are measured
in the head-on cel (x, y) with a longitudinal distance from the axle midpoint.
"""
import json
from math import cos, radians, sin
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ASSETS = Path(__file__).resolve().parents[1] / "public/assets"
CELL = (384, 304)
PIVOT = np.array([192, 224])
UNIT = 256
STEP_DEGREES = 2.5
FRAMES = 55
COLUMNS = 7

# Half-width, vertical pixel in the frontal painting, distance along the car.
# Left and right share these body stations throughout the turn.
STATIONS = {
    "nose": (67, 196, 157), "bumper": (67, 236, 161),
    "hood": (67, 140, 60), "glass": (50, 89, 24),
    "roof": (49, 20, -133), "tail": (67, 59, -158),
    "rack_front": (43, 77, 19), "rack_back": (38, 15, -126),
    "rack_lip": (43, 67, 19), "rack_top": (38, 5, -126),
}

# Texture landmarks on the visible side in the left and right three-quarter
# paintings. The virtual bottom line lies just below the tyre contact patches.
SIDE_UV = [
    dict(nose=(135,191), hood=(194,143), glass=(207,92),
         roof=(319,39), tail=(349,97), low_front=(124,274), low_rear=(357,165)),
    dict(nose=(222,192), hood=(171,143), glass=(164,98),
         roof=(73,41), tail=(47,96), low_front=(229,267), low_rear=(41,147)),
]

# The hub, forward radius and vertical radius of each photographed sidewall.
WHEEL_UV = [
    [((170,222),(-20,11),(0,-32)), ((311,153),(-15,8),(0,-27))],
    [((191,215),(17,10),(0,-29)), ((80,144),(12,7),(0,-24))],
]
# Lower edge of the painted fender, from left to right in each source.
ARCHES = [
    [[(131,239),(139,236),(145,230),(149,214),(155,202),(163,192),(173,186),
      (181,184),(187,186),(191,193),(194,205),(194,218)],
     [(278,170),(288,165),(291,153),(297,138),(307,127),(317,121),
      (324,120),(328,123),(329,137),(329,145)]],
    [[(173,212),(174,194),(177,185),(182,181),(188,182),(198,188),
      (205,197),(211,211),(216,227),(222,231),(228,234)],
     [(64,136),(65,125),(68,117),(73,115),(80,118),(87,124),
      (93,135),(97,151),(102,159),(106,164)]],
]
DISC = 64
TYRE_CELL = 88
RADIUS = 35
HALF_WIDTH = 11


def wheel_textures(sides):
    atlas = Image.new("RGBA", (DISC*8, DISC))
    size = DISC * 4
    y, x = (np.indices((size, size)) + .5) * (2/size) - 1
    r, angle = np.hypot(x,y), np.arctan2(y,x)
    # The hub, rolled lip and illumination stay put. Only the slots and lug
    # nuts rotate. Repeating each detail around the axle keeps their pitch
    # circles concentric even where the original painting was foreshortened.
    relief = np.interp(r, [0,.13,.17,.20,.22,.25,.30,.43,.53,.57,.60,.64,.67,.71,.79],
                          [.97,1.02,1.14,.83,.50,.74,.97,1.06,1.02,.82,1.27,1.19,.57,.64,.83])
    light = 1 + .15*y - .07*x
    detail_shade = np.ones_like(r)
    detail_alpha = np.zeros_like(r)
    for count, orbit, width, height, tones in (
            (9, .76, .135, .103, (.17,.24,.54,1.27)),
            (5, .40, .081, .081, (1.43,1.10,.66,.38))):
        offset = (angle + np.pi/count) % (2*np.pi/count) - np.pi/count
        tangent = r*np.sin(offset)
        radial = r*np.cos(offset)-orbit
        shape = np.hypot(tangent/width, radial/height)
        inside = shape < 1
        detail_shade[inside] = np.interp(shape[inside], [0,.54,.80,1], tones)
        detail_alpha[inside] = np.clip((1-shape[inside])*12, 0, 1)
    for side, image in enumerate(sides):
        for axle, (hub, forward, up) in enumerate(WHEEL_UV[side]):
            a, b = np.array(forward)*2/size, np.array(up)*2/size
            offset = np.array(hub) - forward - up
            face = image.transform((size,size), Image.Transform.AFFINE,
                (a[0],b[0],offset[0],a[1],b[1],offset[1]), Image.Resampling.BICUBIC)
            paint = np.asarray(face.convert("RGB"), dtype=float)
            grain = paint - np.asarray(face.convert("RGB").filter(ImageFilter.GaussianBlur(size/32)))
            steel = np.percentile(paint[(r>.28) & (r<.64)], 65, axis=0)
            moving = Image.fromarray(np.uint8(np.clip(np.dstack(
                (steel*detail_shade[...,None], detail_alpha*255)), 0, 255)))
            plate = steel * (relief*light)[...,None] + np.clip(grain, -25, 25)*.48
            rubber = np.clip((r-.74)/.10, 0, 1)[...,None]
            fixed = Image.fromarray(np.uint8(np.clip(plate*(1-rubber) + paint*rubber, 0, 255)))
            fixed.putalpha(Image.fromarray(np.uint8(255*np.clip((1-r)*25, 0, 1))))
            index = side*2 + axle
            atlas.paste(moving.resize((DISC,DISC), Image.Resampling.BOX), (index*DISC,0))
            atlas.paste(fixed.resize((DISC,DISC), Image.Resampling.LANCZOS), ((4+index)*DISC,0))
    atlas.save(ASSETS / "sprites/car_wheel_faces.webp", lossless=True)


def bake_tyre(front):
    # Cast orthographic rays through a rounded cylinder. Its longitudinal and
    # vertical coordinates give a continuous rubber texture around both shoulders.
    columns = 8
    count = round(90/STEP_DEGREES)+1
    atlas = Image.new("RGBA", (columns*TYRE_CELL, ((count+columns-1)//columns)*TYRE_CELL))
    yy, xx = (np.indices((TYRE_CELL*2, TYRE_CELL*2))+.5)/2-TYRE_CELL/2
    rubber = np.asarray(front.convert("RGB"))
    for frame in range(count):
        angle = radians(frame*STEP_DEGREES)
        c, s = cos(angle), sin(angle)
        nearest = np.full(xx.shape, -np.inf)
        for inset in range(5):
            width = HALF_WIDTH-inset
            radius = RADIUS-4+(16-(4-inset)**2)**.5
            # Screen x is constant along a ray. In wheel space its coordinates
            # are (x*c-depth*s, x*s+depth*c, y-.48*depth).
            k = c*c+.48**2
            b = xx*s*c-yy*.48
            discriminant = b*b-k*((xx*s)**2+yy**2-radius**2)
            root = np.sqrt(np.maximum(0, discriminant))
            lo, hi = (-b-root)/k, (-b+root)/k
            if s > 1e-6:
                lo = np.maximum(lo,(xx*c-width)/s)
                hi = np.minimum(hi,(xx*c+width)/s)
            valid = (discriminant>=0) & (lo<=hi) & ((s>1e-6) | (np.abs(xx*c)<=width))
            nearest = np.where(valid, np.maximum(nearest,hi), nearest)
        hit = np.isfinite(nearest)
        depth = np.where(hit,nearest,0)
        across = xx*c-depth*s
        along, down = xx*s+depth*c, yy-.48*depth
        u = np.clip(np.rint(130+across*.74).astype(int),121,139)
        v = 240 + (np.floor(8*np.arctan2(down,along)).astype(int) % 7)
        cel = np.dstack((rubber[v,u], hit.astype(np.uint8)*255))
        tile = Image.fromarray(cel).resize((TYRE_CELL,TYRE_CELL), Image.Resampling.LANCZOS)
        atlas.paste(tile, (frame%columns*TYRE_CELL,frame//columns*TYRE_CELL))
    atlas.save(ASSETS / "sprites/car_tyre.webp", quality=94)
    return dict(cell=TYRE_CELL, columns=columns, radius=RADIUS, halfWidth=HALF_WIDTH)


def point(station, side):
    width, y, along = STATIONS[station]
    return np.array([width * side * 1.10, along, (y - 206.5) * 1.10])


def project(vertices, angle):
    across, along, frontal_y = np.asarray(vertices).T
    return np.column_stack((across*cos(angle) + along*sin(angle),
        frontal_y + .48*(along*(cos(angle)-1) - across*sin(angle)))) + PIVOT


def render_face(canvas, image, dest, uv, side=0):
    # Rasterize two affine triangles with shared edges, sampling premultiplied ink.
    for ids in ([0,1,2], [0,2,3]):
        tri = dest[ids]
        left, top = np.maximum(0, np.floor(tri.min(axis=0)).astype(int))
        right, bottom = np.minimum(CELL, np.ceil(tri.max(axis=0)).astype(int))
        if right <= left or bottom <= top:
            continue
        basis = (tri[1:] - tri[0]).T
        winding = np.linalg.det(basis)
        if abs(winding) < .01 or winding*side > 0:
            continue
        y, x = np.mgrid[top:bottom, left:right]
        coords = np.stack((x+.5, y+.5), axis=-1)
        weights = (coords - tri[0]) @ np.linalg.inv(basis).T
        inside = (weights.min(axis=-1) >= 0) & (weights.sum(axis=-1) <= 1)
        src = uv[ids]
        u, v = np.moveaxis(src[0] + weights @ (src[1:]-src[0]), -1, 0)
        u = np.clip(u, 0, image.shape[1]-1.001)
        v = np.clip(v, 0, image.shape[0]-1.001)
        i, j = u.astype(int), v.astype(int)
        fx, fy = (u-i)[...,None], (v-j)[...,None]
        sample = ((image[j,i]*(1-fx) + image[j,i+1]*fx)*(1-fy)
                + (image[j+1,i]*(1-fx) + image[j+1,i+1]*fx)*fy)
        patch = canvas[top:bottom,left:right]
        patch[inside] = (sample + patch*(1-sample[...,3:4]/255))[inside]


def texture(image):
    return np.asarray(image.convert("RGBa"), dtype=np.float32)


def side_faces(sign):
    uv = SIDE_UV[0 if sign == 1 else 1]
    pts = {k: point(k, sign) for k in ("nose", "hood", "glass", "roof", "tail")}
    for name, along in (("low_front", 161), ("low_rear", -158)):
        pts[name] = np.array([point("hood", sign)[0], along, .48*along-5])
    t = (60+158)/(161+158)
    pts["low_mid"] = pts["low_rear"]*(1-t) + pts["low_front"]*t
    uv_mid = np.array(uv["low_rear"])*(1-t) + np.array(uv["low_front"])*t
    for keys in (("tail","hood","low_mid","low_rear"), ("hood","nose","low_front","low_mid"),
                 ("roof","glass","hood","tail")):
        coords = np.array([uv_mid if k == "low_mid" else uv[k] for k in keys])
        yield np.array([pts[k] for k in keys]), coords


def side_panel(canvas, sides, sign, angle):
    image = sides[0 if sign == 1 else 1]
    for vertices, coords in side_faces(sign):
        render_face(canvas, image, project(vertices, angle), coords, sign)


def bake():
    driver = Image.open(ASSETS / "sprites/car_driver.webp").resize((360,272))
    road = Image.open(ASSETS / "sprites/car_turn_road.webp").resize((768,512))
    front = texture(road.crop((384,0,768,256)))
    mirror_ink = road.crop((384,0,768,256)).convert("RGBA")
    mask = Image.new("L", mirror_ink.size)
    pen = ImageDraw.Draw(mask)
    for outline in (((108,118),(124,119),(131,126),(131,134),(110,130)),
                    ((246,127),(251,120),(268,117),(271,129),(251,135),(246,134))):
        pen.polygon(outline, fill=255)
    mirror_ink.putalpha(ImageChops.multiply(mirror_ink.getchannel("A"), mask))
    mirrors = texture(mirror_ink)
    paintings = [driver.convert("RGBA"), road.crop((384,256,768,512)).convert("RGBA")]
    tyre = bake_tyre(road.crop((384,0,768,256)))
    wheel_textures(paintings)
    for painting, arches in zip(paintings, ARCHES):
        pen = ImageDraw.Draw(painting)
        for arch in arches:
            pen.polygon([*arch, (arch[-1][0], painting.height), (arch[0][0], painting.height)],
                        fill=(0,0,0,0))
    sides = [texture(image) for image in paintings]
    atlas = Image.new("RGBA", (CELL[0]*COLUMNS, CELL[1]*((FRAMES+COLUMNS-1)//COLUMNS)))
    lamps = []
    wheels = []

    for frame in range(FRAMES):
        angle = radians(-45 + frame*STEP_DEGREES)
        side = 1 if angle < 0 else -1
        side_index = 0 if angle < 0 else 1
        canvas = np.zeros((CELL[1], CELL[0], 4), dtype=np.float32)

        def face(image, vertices, uvs):
            render_face(canvas, image, project(vertices, angle), np.array(uvs, dtype=float))

        def cross(back, fore):
            verts = [point(back,-1), point(back,1), point(fore,1), point(fore,-1)]
            uv = [(189.5 + v[0]/1.10, 206.5 + v[2]/1.10) for v in verts]
            face(front, verts, uv)

        def mirror(sign):
            # The stalk meets the A-pillar. The far mirror goes behind the glass.
            verts = [point("hood",sign) + [sign*x, -8, y] for x,y in
                     ((-12,-20),(10,-20),(10,-4),(-12,-4))]
            uvs = [(189.5+sign*x,y) for x,y in ((57,115),(82,115),(82,135),(57,135))]
            face(mirrors, verts, uvs)

        mirror(-side)
        for sign in (-side, side):
            side_panel(canvas, sides, sign, angle)
        # Hub positions belong to the axles. Both sides use the same wheelbase
        # and ride height; the steering only rotates a wheel around its hub.
        hubs = [[project([[sign*63, along, .48*along-35]], angle)[0].round(2).tolist()
                 for along in (96, -98)] for sign in (1, -1)]
        wheels.append(hubs)
        # Only the luggage rack carries planks. The roof beneath it is enamel.
        face(front, [point("roof",-1), point("roof",1), point("glass",1), point("glass",-1)],
             [(145,144),(232,144),(242,188),(135,188)])
        cross("glass","hood")
        cross("hood","nose")
        cross("nose","bumper")
        mirror(side)
        # The raised luggage rail shows its near side in each oblique view.
        rack_uv = ([(305,17),(212,58),(212,75),(305,25)],
                   [(149,7),(230,56),(230,64),(149,18)])[side_index]
        rack_side = [point(k,side) for k in ("rack_top","rack_lip","rack_front","rack_back")]
        face(sides[side_index], rack_side, rack_uv)
        cross("rack_top","rack_lip")
        cross("rack_lip","rack_front")

        cel = Image.fromarray(np.uint8(np.clip(canvas,0,255)), "RGBa").convert("RGBA")
        atlas.paste(cel, (frame%COLUMNS*CELL[0],frame//COLUMNS*CELL[1]))
        def marker(x,y,along):
            return [(x-189.5)*1.10,along,(y-206.5)*1.10]
        tail = point("tail",side) + [0,1,9]
        locations = project([marker(145,209,158),marker(232,209,158),tail], angle)
        lamps.append(np.round(locations.flatten(),1).tolist())
    atlas.save(ASSETS / "sprites/car_turn_sweep.webp", quality=92, method=6)
    meta = dict(width=CELL[0],height=CELL[1],columns=COLUMNS,pivot=PIVOT.tolist(),unit=UNIT,
                stepDegrees=STEP_DEGREES, lamps=lamps, wheels=wheels, tyre=tyre)
    (ASSETS.parents[1] / "src/render/wagon-turn.json").write_text(json.dumps(meta,separators=(",",":"))+"\n")


if __name__ == "__main__":
    bake()
