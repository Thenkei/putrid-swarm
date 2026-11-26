"""Render the driveway wagon on a fixed body from its painted front and two sides.

Run from any directory with Python, NumPy and Pillow. Body stations are measured
in the head-on cel (x, y) with a longitudinal distance from the axle midpoint.
"""
import json
from math import cos, radians, sin
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw

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

# Hub centre, forward radius and upward radius on each original side painting.
WHEEL_UV = [
    [((170,222),(-16,8),(1,-28)), ((311,153),(-12,6),(1,-22))],
    [((191,215),(13,7),(0,-24)), ((80,144),(11,6),(0,-21))],
]
DISC = 64


def wheel_textures(sides):
    atlas = Image.new("RGBA", (DISC*4, DISC))
    yy, xx = np.mgrid[:DISC, :DISC]
    r = np.hypot((xx+.5)/32-1, (yy+.5)/32-1)
    mask = Image.fromarray(np.uint8(255*np.clip((1-r)*12, 0, 1)))
    for side, image in enumerate(sides):
        for axle, (hub, forward, up) in enumerate(WHEEL_UV[side]):
            a, b = np.array(forward)/32, np.array(up)/32
            offset = np.array(hub)-forward-up
            disc = image.transform((DISC, DISC), Image.Transform.AFFINE,
                (a[0],b[0],offset[0],a[1],b[1],offset[1]), Image.Resampling.BICUBIC)
            disc.putalpha(ImageChops.multiply(disc.getchannel("A"), mask))
            atlas.paste(disc, ((side*2+axle)*DISC, 0))
    atlas.save(ASSETS / "sprites/car_wheel_faces.webp", quality=96)

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
    mounts = [None, None]
    for vertices, coords in side_faces(sign):
        dest = project(vertices, angle)
        render_face(canvas, image, dest, coords, sign)
        for axle, (hub, forward, up) in enumerate(WHEEL_UV[0 if sign == 1 else 1]):
            for ids in ([0,1,2], [0,2,3]):
                tri = coords[ids]
                inv = np.linalg.inv((tri[1:]-tri[0]).T)
                bary = inv @ (hub-tri[0])
                if min(bary) < 0 or sum(bary) > 1:
                    continue
                projected = dest[ids]
                basis = (projected[1:]-projected[0]).T @ inv
                centre = projected[0] + basis @ (hub-tri[0])
                mounts[axle] = np.round(np.r_[centre, basis @ forward, basis @ up], 2).tolist()
    assert all(mount is not None for mount in mounts)
    return mounts


def front_tyre(sign, painting):
    """Extrude the painted contact edge in axle space so it joins the sidewall at every yaw."""
    driver = sign == 1
    # Trace the exposed lower arc from the back of the tyre towards the bumper.
    xs = range(190, 133, -2) if driver else range(176, 225, 2)
    alpha = np.asarray(painting.getchannel("A"))
    edge = [(x, np.flatnonzero(alpha[:, x] > 128)[-1] + .5) for x in xs]
    # The rising leading edge disappears behind the painted bumper.
    edge += [(133, 233), (133, 218)] if driver else [(225, 230), (225, 216)]
    triangles = [(verts[ids], uv[ids]) for verts, uv in side_faces(sign)
                 for ids in ([0,1,2], [0,2,3])]
    def on_panel(pixel):
        # Use the closest triangle at antialiased pixels just outside the panel.
        choices = []
        for verts, uv in triangles:
            u, v = np.linalg.solve((uv[1:] - uv[0]).T, pixel - uv[0])
            choices.append((min(u, v, 1-u-v), verts[0] + u*(verts[1]-verts[0]) + v*(verts[2]-verts[0])))
        return max(choices, key=lambda pair: pair[0])[1]
    profile = np.array([on_panel(pixel) for pixel in edge])
    # A rounded shoulder on each edge of the tread, with the outer one just
    # inside the original ink. Each strip shares its edge with the next.
    rings = [profile + [-sign*inset, 0, drop] for inset, drop in
             ((0, -.5), (2, 1), (5, 2), (17, 2), (21, .5), (23, -2), (24, -5))]
    return np.array(rings)


def paint_tyre(canvas, front, rings, sign, angle):
    left = 241 if sign == 1 else 122
    # Only rubber from below the bumper is sampled. Follow the curve around
    # the tyre with a continuous strip of the original front-facing tread.
    rows = np.clip(238 + (rings[:, :, 2] - 26) * .44, 238, 247)
    cols = left + (rings[:, 0, 0] - rings[0, 0, 0]) * .66 + (16 if sign == 1 else 0)
    projected = project(rings.reshape(-1, 3), angle).reshape(*rings.shape[:2], 2)
    # The inward-facing wall is visible below the far side of the car.
    # Close both ends behind the tread and the painted outer sidewall.
    for rim in (projected[-1], projected[0]):
        centre = (rim[0] + rim[-1]) / 2
        for a, b in zip(rim[:-1], rim[1:]):
            render_face(canvas, front, np.array([centre, a, b, centre]),
                        np.array([(left+8,240),(left+1,244),(left+14,244),(left+8,240)]))
    for j in range(rings.shape[1] - 1):
        for i in range(len(rings) - 1):
            ix = ([i,i+1,i+1,i], [j,j,j+1,j+1])
            uv = np.column_stack((cols[ix[0]], rows[ix]))
            render_face(canvas, front, projected[ix], uv)
    # The animated grooves occupy the forward rubber, below the bumper.
    j = np.argmax(projected[2, :, 1])
    centre = (projected[2,j] + projected[3,j]) / 2
    across = (projected[3,j] - projected[2,j]) * .55 * -sign
    return np.round(np.r_[centre - [0, 7], across, [0, 3]], 2).tolist()


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
    tyres = [front_tyre(1, paintings[0]), front_tyre(-1, paintings[1])]
    wheel_textures(paintings)
    sides = [texture(image) for image in paintings]
    atlas = Image.new("RGBA", (CELL[0]*COLUMNS, CELL[1]*((FRAMES+COLUMNS-1)//COLUMNS)))
    lamps = []
    wheels = []
    treads = []
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

        treads.append([paint_tyre(canvas, front, tyre, sign, angle)
                       for tyre, sign in zip(tyres, (1, -1))])
        mirror(-side)
        for sign in (-side, side):
            mounts = side_panel(canvas, sides, sign, angle)
            if sign == side:
                wheels.append(mounts)
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
                stepDegrees=STEP_DEGREES, lamps=lamps, wheels=wheels, treads=treads)
    (ASSETS.parents[1] / "src/render/wagon-turn.json").write_text(json.dumps(meta,separators=(",",":"))+"\n")


if __name__ == "__main__":
    bake()
