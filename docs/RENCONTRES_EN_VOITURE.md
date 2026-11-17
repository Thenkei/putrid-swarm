# Rendre les sorties en voiture intéressantes

**Document de propositions — 17 novembre 2026.** Le premier prototype (section 11) est maintenant dans le jeu ; rien n’a encore été validé en partie. Les chiffres servent de réglages de départ.

> **État au 17 novembre 2026.**
>
> **Dans le jeu :** le coffre séparé de la réserve ; le lot disputé sur place, avec partage, échange, pari aux rondelles, menace, bagarre en trois échanges au plus, ou renoncement ; deux survivants récurrents (la Brocanteuse, le Campeur) qui retiennent un service ou un grief ; l’embuscade au retour avec deux groupes (le comité de quartier, ceux de la camionnette) ; l’arrivée au refuge qui montre ce qui est déchargé, ce qui a été laissé en route et ce que cela permet encore de poser. Les réglages sont dans `src/core/data/rivals.ts`, les règles dans `src/core/encounters.ts`.
>
> **Pas dans le jeu :** les armes (section 7), les rencontres avec les voisins futurs boss (ils gardent leur accueil actuel), la seconde forme de bagarre « tactique », les autres épreuves (bras de fer, enchère), les itinéraires, l’essence, les dégâts de la voiture, et les rencontres 2 à 6, 8 et 12 de la section 9.
>
> **Écarts assumés par rapport au texte :** la menace et la bagarre sont déterministes (ce que l’autre s’apprête à faire est affiché, chaque réponse annonce son prix) plutôt que tirées au sort ; « céder une partie » et « abandonner une caisse » sont une seule réponse à l’embuscade (payer, en choisissant les pièces) ; quelqu’un qui en veut au joueur a déjà chargé sa moitié du lot à son arrivée.

**Complément demandé : des rencontres au retour pour tenter de nous voler notre magot, avec des gens d’autres villes ou un groupement de voisins.** Cette direction fait partie du périmètre souhaité ; les situations et règles ci-dessous restent des propositions.

## 1. La direction que je recommande

**Faire de chaque sortie une occasion de rencontrer quelqu’un qui veut quelque chose que l’on veut aussi.** La vieille voiture devient le moyen de s’aventurer, de transporter ce qu’on a obtenu et de se tirer d’une situation qui dégénère.

La situation type : on arrive au garage pour récupérer une batterie. Quelqu’un a déjà ouvert le capot. Il reste un seul objet utile, et personne n’a envie de repartir les mains vides. On peut négocier, accepter un petit jeu pour départager les deux personnes, tenter de prendre l’objet de force, ou renoncer.

Ton idée est bonne parce qu’elle ajoute une opposition et une décision à la collecte. Mais **une rencontre ne doit pas automatiquement imposer un mini-jeu ou un combat** : cela remplacerait les clics de fouille par une autre routine. Il faut un enjeu précis, plusieurs solutions crédibles et des conséquences dont on se souvient.

Je recommande une combinaison : **des rencontres courtes autour du partage des ressources, quelques personnages récurrents et une escalade possible vers la violence.** Le mini-jeu est une manière de régler le conflit ; la bagarre en est une autre ; sortir de la situation doit aussi pouvoir être une bonne décision.

**Avoir gagné le butin ne signifie pas encore l’avoir ramené.** Au retour, le coffre chargé peut attirer des inconnus venus d’une autre ville ou des voisins qui se sont regroupés pour réclamer leur part. La sortie comprend donc deux enjeux : obtenir les ressources, puis réussir à les mettre à l’abri.

Hypothèse de travail : « deux personnes au même endroit » signifie ici le protagoniste et un PNJ, dans le jeu solo actuel. Si tu vises deux joueurs humains, les idées de partage restent utiles, mais l’attente, la déconnexion et l’équité des épreuves demanderaient un cadrage multijoueur distinct.

## 2. Pourquoi la phase actuelle paraît plate

Constats issus du code actuel, sans prétendre à un diagnostic de playtest :

| Aujourd’hui | Ce que cela produit |
| --- | --- |
| Le trajet est une transition visuelle de 3,2 secondes, que l’on peut passer | La voiture donne une ambiance, mais aucune décision pendant le déplacement |
| On choisit une destination, clique sur les points de fouille, puis rentre | L’ordre des clics compte davantage que la manière d’aborder une situation |
| Les voisins donnent un objet ou prennent du temps automatiquement ; le dialogue se ferme avec « OK » | On rencontre des personnages sans réellement interagir avec eux |
| Chaque fouille coûte 30 minutes et donne automatiquement des ressources dans une fourchette | L’incertitude porte sur la quantité obtenue, peu sur ce qui pourrait arriver |
| Les points fouillés restent vides pour la campagne | Il existe déjà une rareté exploitable, mais personne ne nous dispute ces ressources |
| Le retour avant la nuit est garanti par les règles de temps | Le risque de sortie est actuellement très limité ; on ne peut pas simplement ajouter des retards aléatoires sans revoir cette garantie |

Le Tondeur prend déjà un quart d’heure, le Dépanneur donne des pièces et accumule des factures, la Factrice apporte un colis, le Chef limite la fouille à deux endroits par visite. Ce sont de bons débuts de caractère. Il leur manque une réponse du joueur et un effet sur la suite de la relation.

**Le problème principal n’est donc pas la durée de la conduite. C’est le manque de décisions entre le départ et le retour.** Ajouter de longues portions de route ne suffirait pas.

## 3. Trois propositions de jeu

| Direction | Ce qu’on joue | Intérêt principal | Risque de conception | Priorité proposée |
| --- | --- | --- | --- | --- |
| **A — Le dernier lot** | Deux personnes revendiquent une ressource ; échange, partage, défi ou conflit | Donne immédiatement un enjeu à la fouille, avec peu de nouveaux systèmes | Répétitif si chaque lieu est occupé par un adversaire | Commencer ici |
| **B — Les habitués du village** | On retrouve quelques survivants avec lesquels on a un passif | Rend les sorties mémorables et les choix persistants | Beaucoup d’écriture si chaque interaction ouvre plusieurs branches | Ajouter un seul personnage récurrent au premier prototype |
| **C — La mauvaise route** | Au retour, un groupe tente de prendre le chargement ; d’autres obstacles peuvent aussi interrompre le trajet | Donne un enjeu au rapatriement du magot et un rôle plus actif à la voiture | Accumulation d’incidents arbitraires qui ralentissent toutes les sorties | Tester une embuscade au retour dans le premier prototype ; diversifier les incidents ensuite |

Ces propositions se combinent. La première version devrait comparer une dispute sur place et une embuscade au retour, avec un élément de relation persistante. Les autres incidents de route pourront venir ensuite.

### A — Le dernier lot

Le conflit porte sur un objet visible : une caisse de ressorts, une batterie, un rouleau de grillage. Les autres ressources du lieu ne deviennent pas automatiquement la propriété du gagnant.

On voit immédiatement :

- ce qui est disputé et à quoi cela pourrait servir ce soir ;
- qui est là, ce qu’il réclame et ce qu’il tient en main ;
- si la voiture reste accessible pour repartir ;
- les coûts connus des solutions proposées.

Les ressources sont **prises dans le butin prévu pour le lieu**. Le PNJ ne fait pas apparaître une récompense supplémentaire à chaque visite. Une fois le lot partagé, perdu ou gagné, il est consommé une seule fois.

Exemple : « Trois ressorts dans cette caisse. Il vous en faut un pour les pieux. L’autre personne veut les trois pour réparer son installation. » On comprend pourquoi chacun insiste.

### B — Les habitués du village

Un survivant récurrent peut avoir un besoin simple : récupérer des batteries, protéger son atelier ou retrouver des outils. Il reconnaît ensuite la manière dont on l’a traité.

Trois états suffisent au départ : **inconnu, vous doit un service, vous en veut**. Pas de jauge globale de réputation, de factions ou d’arbre de dialogue tentaculaire.

Exemples de retours :

- Après un partage équitable, il accepte une fois de réserver un lot contre un échange précis.
- Après une menace, il refuse un prochain pari et garde davantage ses distances.
- Après une bagarre, on le retrouve avec la trace du coup ; il ne rejoue pas la scène comme si rien ne s’était passé.

Chaque conséquence doit être limitée et écrite : « refuse cet échange », « conserve cette caisse jusqu’à demain ». Un allié ne fournit pas des ressources gratuites tous les matins.

Les voisins existants restent précieux pour annoncer leurs habitudes de futurs boss. Ils n’ont pas besoin d’être tous des adversaires : le Tondeur peut proposer une épreuve absurde et la Factrice un échange, pendant qu’un autre survivant est réellement dangereux.

### C — La mauvaise route

Quelques interruptions possibles : une voiture en travers, un conducteur qui réclame de l’aide, quelqu’un qui bloque un passage pour exiger une caisse.

Le joueur choisit entre contourner, s’arrêter ou renoncer à la destination. Le décor et le son doivent annoncer le problème avant l’engagement : moteur arrêté au milieu de la chaussée, silhouette qui observe, passage latéral visible.

Pour commencer, les contournements sont des options locales avec un coût affiché. Inutile de construire immédiatement un réseau routier dynamique.

Le retour avec un lot convoité peut être plus tendu que l’aller. Mais il ne faut pas imposer une seconde rencontre après chaque fouille. **Une sortie sans incident doit rester possible et brève.**

#### Les embuscades au retour — « Ouvre le coffre »

La voiture revient avec des pièces dont on a déjà prévu l’usage pour la nuit. Dans un passage étroit, une camionnette bloque la route. Deux personnes sont visibles devant ; une troisième s’approche du coffre. « On a vu ce que tu as chargé. Tu vas partager. »

L’enjeu est différent d’une dispute à la fouille : **on défend quelque chose que l’on vient de gagner**, avec le temps du retour et la préparation du soir en tête. Le chargement reste exposé jusqu’à l’arrivée effective au refuge. L’écran de départ du lieu ne doit pas le considérer comme déjà sécurisé.

#### Deux origines, deux types de pression

| Groupe | Ce qu’il veut | Ce qui le distingue dans la rencontre | Conséquence possible |
| --- | --- | --- | --- |
| **Des gens d’une autre ville** | Repartir avec du matériel, parfois une ressource précise pour leur propre véhicule | Véhicule inconnu, questions sur les réserves du coin, peu d’attaches locales ; certains négocient, d’autres pillent | Céder un lot convenu, les faire renoncer ou reconnaître leur véhicule lors d’un prochain passage |
| **Un groupement de voisins** | Prélever une « contribution », récupérer un lot qu’ils estiment collectif, ou régler un grief | Un porte-parole connu et des visages qui n’ont pas tous la même détermination ; ils peuvent connaître nos habitudes | Un partage apaise cette demande ; une humiliation ou une menace laisse un passif avec les membres présents |

L’origine ne suffit pas à définir l’hostilité : des inconnus peuvent être raisonnables et des voisins dangereux. Leur demande, leur équipement et leur comportement doivent permettre de les juger. Pour les voisins, réutiliser le passif local déjà prévu, sans créer un système complet de factions. Les personnages absents ou déjà infectés ne peuvent pas participer au groupe.

#### Comment protéger son magot

| Réponse | Décision concrète | Limite ou risque à rendre visible |
| --- | --- | --- |
| **Céder une partie** | Choisir les ressources remises dans le chargement : sauver les ressorts nécessaires aux pieux en donnant du bois | Le groupe annonce ce qu’il accepte ; pas de demande supplémentaire après avoir validé l’accord |
| **Négocier** | Identifier leur besoin et proposer moins, mais plus utile pour eux | Ne fonctionne que si l’offre répond à une demande crédible ; aucun accès aux ressources restées au refuge |
| **Jouer sur les désaccords** | Parler au voisin hésitant ou rappeler un service rendu pour contester le porte-parole | Les indices doivent être visibles ; un groupe déterminé ne se dissout pas avec une formule universelle |
| **Se dégager en voiture** | Reculer ou prendre un passage latéral avant que le groupe ne ferme l’accès | Possible uniquement si la scène montre une issue ; coût maximal du détour annoncé et compatible avec le retour |
| **Défendre le coffre** | Se placer entre le voleur et la caisse, repousser ou menacer | Descendre peut exposer la portière ; l'objectif reste de repartir avec le chargement, pas de vaincre chaque membre |
| **Abandonner une caisse pour partir** | Lâcher un lot explicitement choisi afin de créer une ouverture | Le lot est réellement perdu ; sa valeur et le temps du repli sont connus avant confirmation |

Un groupe ne se joue pas comme trois duels successifs. Une personne parle, une autre surveille la voiture, une troisième tente de prendre le lot : le joueur doit choisir à quelle pression répondre. La confrontation courte peut se terminer dès qu’un accord est tenu ou qu’une ouverture permet de repartir.

Le mini-jeu reste possible avec un groupe disposé à respecter un pari, mais il ne doit pas être la solution automatique à un braquage. Les armes suivent les règles d’escalade décrites plus bas ; sortir une arme face à plusieurs personnes déjà armées n’est pas une victoire gratuite.

#### Déclenchement et fréquence

- Une tentative de vol du magot nécessite un chargement réel. À coffre vide, pas de ressources inventées pour alimenter la scène.
- Le groupe a une raison de cibler la voiture : quelqu’un a observé le chargement, le véhicule attend près d’une sortie de ville, ou les voisins reconnaissent nos passages. Il ne connaît pas magiquement le contenu exact du coffre fermé.
- Avant le point d’engagement, un signe permet de réagir : véhicule dans le rétroviseur, barrage visible, silhouettes qui se répartissent. Le vol n’est pas une simple notification de perte aléatoire.
- Alterner sorties tranquilles, rencontres sur place et embuscades au retour. Une embuscade compte dans le plafond de rencontres majeures de la sortie et du jour ; ne pas l’ajouter systématiquement après un défi déjà joué.
- Pour le premier essai, mettre en jeu un lot clairement désigné et préserver une issue de repli avec une perte bornée. Tester ensuite l’intensité avant d’envisager le vol de tout le chargement.

La tension recherchée : « Je tiens à ces ressorts, mais est-ce que je donne le bois pour rentrer à temps ? » Le joueur doit avoir une décision avant la perte, puis voir exactement ce qui arrive dans le coffre du refuge.

## 4. Le déroulement d’une bonne rencontre

1. **Repérer.** Une image, un bruit et une phrase suffisent à comprendre qui occupe le lieu. « Il y a quelqu’un près du coffre ouvert. »
2. **Comprendre le désaccord.** Le lot et les demandes sont explicites. Pas de dialogue de deux minutes avant de découvrir l’enjeu.
3. **Choisir une approche.** Par exemple : partager, proposer un échange, accepter son défi, insister, repartir. Montrer trois ou quatre choix pertinents, plutôt que tous les choix dans toutes les situations.
4. **Jouer si nécessaire.** Une épreuve de 20 à 40 secondes ou une confrontation de quelques échanges.
5. **Constater le résultat.** Qui prend quoi, combien de temps a passé, comment la relation a changé.
6. **Continuer.** Fouiller le reste du lieu si la situation le permet, ou reprendre la voiture.

Le temps de réflexion dans les menus ne consomme pas de journée. Le coût en temps de jeu est annoncé avant de s’engager. Pendant une épreuve de précision, seul le mouvement de l’épreuve suit le temps réel.

L’objectif de rythme à tester : **une rencontre complète en moins d’une minute**, hors lecture volontaire et cas exceptionnels. Les dialogues déjà connus se raccourcissent lors des visites suivantes.

## 5. Quels petits jeux pour se départager ?

Le jeu proposé doit avoir une raison d’exister dans la scène. Deux personnes qui ont accepté un pari peuvent respecter le résultat. Un pillard qui veut tout prendre n’a aucune raison d’accepter soudainement une partie équitable.

| Épreuve | Règle proposée | Pourquoi elle convient | Limite |
| --- | --- | --- | --- |
| **Les palets de rondelles** | Trois rondelles à lancer sur un établi ; un arrêt de curseur détermine la précision | Objets de récupération, résultat visible, peu de commandes | L’habileté peut finir par rendre le pari systématiquement rentable |
| **Le bras de fer** | Maintenir puis relâcher pour gérer l’effort face aux poussées adverses | Duel physique sans passer directement à la bagarre | Demande une animation lisible ; éviter le martèlement de boutons |
| **L’enchère fermée** | Chacun engage secrètement 0 à 2 pièces ; offre la plus haute gagnante, égalité = partage ; les mises sont dépensées | Crée un choix économique et du bluff, sans réflexes | Un seul tour est surtout un pari ; il faut des indices sur les habitudes adverses |

### Mon premier choix : les palets de rondelles

Une planche, trois rondelles, une vieille boîte à biscuits comme cible. Le PNJ pose sa caisse : « Trois lancers chacun. Celui qui gagne repart avec. »

Règle de départ :

- trois lancers chacun ; chaque lancer marque 0, 1 ou 2 points selon la zone atteinte ;
- le joueur voit le lancer et le score adverses avant son lancer correspondant ;
- un seul contrôle de précision, sans ajouter une gestion de puissance et de trajectoire ;
- meilleur total = lot gagné ; égalité = partage annoncé à l’avance, avec l’arrondi défini pour les lots indivisibles ;
- une seule partie pour ce lot, sans revanche permettant de recréer ou de rejouer le butin ;
- aucune ressource du refuge n’est mise en jeu : l’enjeu initial est la caisse encore disputée.

Un lot indivisible peut avoir une autre règle d’égalité, par exemple revenir à son détenteur initial. Cette règle doit être visible avant le pari ; le prototype peut éviter ce cas en utilisant une caisse divisible.

Pour tester le bras de fer ou l’enchère, remplacer cette épreuve dans une variante du prototype. **Ne pas fabriquer les trois avant d’avoir vérifié qu’un seul défi donne envie de rejouer.**

L’échange doit rester compétitif face au mini-jeu : il est plus rapide et garantit le résultat. Si le joueur expérimenté gagne tous les défis pour presque aucun coût, la négociation disparaîtra. Ajuster d’abord le temps engagé et les enjeux ; éviter un adversaire qui triche secrètement pour compenser le niveau du joueur.

Prévoir une alternative sans précision rapide, par le partage ou l’échange. Si le défi est la seule voie vers un objet indispensable, il faut aussi une variante accessible de l’épreuve.

## 6. Quand cela finit aux mains

**Oui à la bagarre, avec un objectif local : prendre la caisse, ouvrir le passage ou réussir à rejoindre la voiture.** Une défaite peut coûter le lot ou du temps ; elle n’a pas besoin de tuer le protagoniste et d’annuler toute la campagne.

### Deux manières de la jouer

| Forme | Fonctionnement | Avantage | Coût |
| --- | --- | --- | --- |
| **Confrontation par décisions** | Deux ou trois choix successifs : se dégager, exploiter une ouverture, lâcher la caisse | Rapide à produire, compatible avec les scènes et portraits actuels | Risque de devenir un questionnaire si les bonnes réponses sont fixes |
| **Petite scène tactique** | Quelques positions autour de la voiture : couvert, caisse, portière ; une action du joueur puis réaction du PNJ | Rend la position et l’accès à la fuite concrets | Nouvelles animations, règles de déplacement et davantage de validation |

Je commencerais par la première forme pour valider l’escalade, puis je testerais la seconde si les joueurs réclament davantage de contrôle. Le document ne suppose pas qu’un système de combat complet existe déjà.

### Proposition de confrontation courte

La scène montre l’intention visible de l’adversaire : il s’approche, protège le lot ou barre la portière. On dispose de quelques réponses adaptées à cette situation :

- **Se dégager** : reprendre l’accès à la voiture, quitte à abandonner le lot.
- **Saisir une occasion** : récupérer la caisse pendant qu’il protège autre chose ; cela peut exposer à un coup.
- **Frapper ou repousser** : créer une ouverture, avec un risque annoncé de perte de temps ou de matériel.
- **Céder** : terminer immédiatement le conflit en acceptant la demande annoncée.

Les occasions dépendent de ce qui est visible et des actions précédentes. Un coup de clé ne donne pas un avantage abstrait de « +10 attaque » : il peut permettre de faire lâcher une prise, tout en rendant la relation hostile.

**Borner la scène à trois échanges.** Au dernier, le conflit se termine par une prise du lot, un partage forcé ou un repli. Pas d’ennemi dont il faut vider une longue barre de vie. Les probabilités éventuelles doivent rester attachées à un risque lisible ; éviter une issue tirée au sort après un bouton « se battre ».

Pour la première version, la blessure peut être un coût de temps de récupération annoncé dans la fourchette de risque. Une santé persistante, des soins et des handicaps sur plusieurs nuits seraient une extension distincte. Ils rendraient les premières erreurs beaucoup plus difficiles à rattraper.

## 7. Et les armes ?

Les armes peuvent rendre une rencontre beaucoup plus tendue. Elles doivent modifier les possibilités de la scène, sans transformer les sorties en collecte systématique par élimination des occupants.

### Trois usages à distinguer

| Usage | Effet intéressant | Conséquence à montrer |
| --- | --- | --- |
| **Montrer une arme** | Tenter de faire céder quelqu’un sans combattre | Le PNJ voit la menace, peut reculer, refuser ou sortir sa propre arme selon son profil |
| **Arme improvisée au contact** | Aider à se dégager ou imposer le passage | Escalade visible ; risque de blessure et relation détériorée |
| **Tirer** | Terminer brutalement une confrontation ou couvrir une fuite | Munition dépensée, blessure éventuelle et bruit qui compromet la poursuite de la fouille |

Une menace ne doit pas fonctionner selon un pourcentage générique identique sur tous les personnages. Une personne isolée qui veut rentrer peut céder ; quelqu’un déjà à couvert et armé est une autre situation. Montrer ces indices avant le choix.

Si les armes à feu arrivent dans une deuxième version :

- munitions rares et explicitement comptées ; une balle ne peut pas être dépensée deux fois ;
- un seul usage de départ, par exemple couvrir un repli, avant d’ajouter visée, rechargement ou inventaire d’armes ;
- conséquence sonore locale et compréhensible : des infectés convergent et obligent à abandonner le reste de la fouille ;
- possibilité d’obtenir ce que l’on veut sans tirer, pour que chaque cartouche représente un choix.

**Éviter la punition magique « un coup de feu = plus de zombies chez vous ce soir ».** Le lien géographique serait douteux si l’affrontement a lieu à l’autre bout du village. Une complication sur place est plus claire. Une poursuite jusqu’au refuge ne devient crédible que si le jeu montre qu’on est suivi et permet d’agir dessus.

### Point de cohérence à trancher avant la violence létale

Les voisins actuels deviennent des boss à des nuits fixes. Permettre de tuer le Dépanneur au garage puis le faire revenir comme prévu, sans expliquer ce qui s’est passé, casserait la continuité.

Pour le prototype, je recommande :

- les voisins destinés à devenir boss participent aux échanges et aux défis, sans branche létale proposée ;
- les conflits physiques sont introduits avec un survivant distinct ;
- si l’on veut ensuite pouvoir tuer n’importe qui, prévoir explicitement ce que devient la nuit du boss absent et ce que signifie cette mort dans les règles d’infection.

Ce choix ne tranche pas le lore de l’infection. Il évite de promettre une liberté que la campagne actuelle ne sait pas encore assumer.

## 8. La voiture doit participer aux décisions

La voiture peut devenir intéressante sans conduite libre ni simulation de mécanique.

### Dès la première version

- **Rester au volant ou descendre.** Au volant, on peut observer et repartir. Descendre permet d’accéder au lot ou de parler plus directement, mais on s’engage davantage.
- **Garder un accès à la portière.** La rencontre montre si le passage est libre. Un PNJ qui le bloque change les possibilités de repli.
- **Choisir quoi ramener.** Si l’on doit céder quelque chose, cela provient du butin de la sortie, pas de la réserve restée chez soi.
- **Faire un retour lisible.** Montrer les ressources effectivement rapportées et une trace de la rencontre : caisse manquante, rondelle gagnée, souvenir d’une menace.

Cela oblige à distinguer le stock du refuge du chargement de la sortie. Aujourd’hui, le « coffre » affiché correspond à l’inventaire global : ce n’est pas encore un stockage séparé.

### Plus tard, seulement si les sorties le justifient

| Ajout | Décision apportée | Pourquoi attendre |
| --- | --- | --- |
| Deux itinéraires vers certains lieux | Aller vite par un passage occupé ou prendre un détour connu | Nécessite une carte et des informations de route compréhensibles |
| Coffre à capacité limitée | Ramener du bois volumineux ou une pièce rare | Change toute l’économie ; risque de multiplier les allers-retours |
| Petite amélioration de la voiture | Protéger le coffre ou faciliter une fuite | Intéressant seulement si ces situations existent assez souvent |
| Dégâts persistants | Réparer aujourd’hui ou accepter des sorties plus difficiles | Peut créer une spirale de pénalités ; ne doit jamais rendre la partie bloquée |

Je n’ajouterais pas d’essence au premier prototype. On possède déjà une contrainte de temps. Une deuxième dépense obligatoire ne crée de l’intérêt que si elle ouvre de vrais choix de trajet.

## 9. Douze rencontres concrètes

Toutes les scènes ci-dessous sont des propositions d’écriture, pas du canon ajouté au jeu.

| Rencontre | Situation et options | Ce qui peut rester après |
| --- | --- | --- |
| **La dernière caisse** | À la quincaillerie, un survivant revendique les ressorts. Partager, échanger de la ferraille, jouer aux rondelles ou insister | Le lot disparaît du stock fouillable ; le survivant retient un partage ou une menace |
| **Les rondelles du Dépanneur** | Au garage, il propose un défi sur l’établi pour un lot de pièces ; achat direct possible, plus rapide | Première vraie interaction avec son obsession de la facture ; annonce son équipement de boss |
| **La bordure du Tondeur** | La voiture mord sur sa pelouse. Reculer et perdre un peu de temps, l’aider à redresser la bordure contre du bois, ou renoncer au service | Une bande rectiligne et son bruit de tondeuse annoncent son comportement nocturne |
| **Le colis sans destinataire** | La Factrice cherche à qui remettre un colis. Prendre le temps de l’aider contre un partage connu, ou poursuivre sa propre fouille | Une petite faveur mémorisée ; le colis n’est obtenu qu’une fois |
| **Les deux endroits réglementaires** | Le Chef autorise deux fouilles. Choisir les deux, échanger du matériel pour un troisième accès explicitement accordé, ou repartir | Transforme une limite actuelle en négociation ; pas de troisième accès recréé à chaque retour |
| **Le conducteur en travers** | Une voiture bloque la route. Aider à la pousser, payer le passage si c’est un piège annoncé par des indices, ou contourner | Un détour connu peut ensuite être indiqué sur la carte |
| **La main sur le coffre** | Au retour, quelqu’un essaie de prendre une caisse pendant un arrêt. Lâcher le lot, négocier son contenu ou se dégager | Une bagarre porte sur le chargement effectivement présent ; aucune ponction sur le stock du refuge |
| **Le marché du Maire** | Du bois contre un service de campagne absurde mais concret : charger ses panneaux, écouter son annonce ou accepter un lot plus petit | Son mégaphone et sa façon de rallier les gens préparent sa présence de boss |
| **La camionnette de l’autre ville** | Au retour, des inconnus bloquent un passage et réclament une batterie pour leur véhicule. Négocier une autre pièce, contourner ou défendre le lot | Leur véhicule et les visages deviennent reconnaissables ; la ressource cédée est retirée du chargement |
| **La contribution des voisins** | Un groupe local réclame « sa part » du matériel ramené. Choisir une contribution, rappeler un service ou refuser | Le porte-parole et les membres présents se souviennent du résultat ; aucune contribution n’est débitée hors rencontre |
| **Celui qui parle, celle qui ouvre** | Pendant qu’un membre du groupe occupe la conversation, un autre s’approche visiblement du coffre. Verrouiller l’accès, interrompre la discussion ou lâcher une caisse pour repartir | Le joueur peut déjouer la tentative grâce aux indices ; le vol n’a pas déjà eu lieu à l’ouverture de l’écran |
| **La voiture dans le rétroviseur** | Un véhicule suit le retour depuis le lieu de fouille. Prendre un détour disponible, s’arrêter dans un passage dégagé ou préparer une confrontation | La menace reste sur la route dans ce prototype ; une éventuelle découverte du refuge demanderait un prolongement explicite |

Ne pas produire ces douze rencontres d’un coup. Elles forment une réserve de situations qui utilisent quatre intentions : obtenir un objet, accéder à un lieu, protéger son chargement, réussir à partir.

## 10. Faire sentir les conséquences sans écraser la partie

### Des coûts reliés à la préparation

Le temps et les ressources existants fournissent déjà de vrais enjeux. Dans les réglages actuels, poser des pieux coûte **un ressort, deux ferrailles et 30 minutes**. Une batterie permet notamment de construire un klaxon ou un projecteur avec les autres matériaux requis.

Une rencontre devient intéressante si elle fait hésiter : « Je prends le temps de gagner les ressorts, ou je sécurise un partage et je rentre construire ? »

Exemple de budget, avec deux heures de jour restantes au départ vers le garage :

| Choix au garage | Aller | Rencontre | Retour | Temps encore disponible chez soi |
| --- | --- | --- | --- | --- |
| Partage rapide | 30 min | 15 min | 30 min | 45 min |
| Défi de rondelles | 30 min | 30 min | 30 min | 30 min |
| Conflit plus long | 30 min | Jusqu’à 45 min | 30 min | Au moins 15 min |

Le défi peut offrir davantage de ressorts, mais une seule construction de pieux tient encore dans le temps restant. Le conflit peut rapporter le lot tout en empêchant de construire ce qu’on voulait. Ces durées sont proposées ; les temps de trajet et de construction cités viennent du jeu actuel.

### Préserver une sortie de situation

- Repartir avant de s’engager dans une rencontre volontaire ne coûte que le trajet déjà effectué et le retour connu.
- Une option risquée affiche son coût maximal en temps. Elle est inaccessible si ce maximum ne laisse plus rentrer ; elle peut aussi rester disponible avec une issue de repli bornée, explicitement annoncée.
- Un incident imposé doit toujours laisser un repli compatible avec le retour : abandon de la caisse, détour déjà inclus dans le budget, ou renoncement à la visite. Aucune dette de temps cachée.
- Le joueur peut perdre le lot disputé et une partie explicitement annoncée du chargement ; les ressources déjà au refuge restent acquises.
- Une première erreur ne doit pas cumuler blessure durable, voiture cassée, stock volé et nuit renforcée.

Ces limites sont importantes : le jour doit modifier la difficulté de la nuit sans rendre une campagne de sept nuits irrécupérable sur une seule rencontre.

### Garder des respirations

Réglage initial proposé : première rencontre introduite après une fouille simple ; ensuite, au plus une rencontre majeure par sortie et deux par jour. Les retours ne déclenchent pas systématiquement un nouvel incident. Ces plafonds doivent être testés contre le nombre réel de sorties : si tout le jour devient une suite de dialogues, il faut réduire leur fréquence.

Certains lieux restent vides. Certains PNJ rendent service. Tous les survivants ne doivent pas être des racketteurs, sinon tirer le premier devient la réponse rationnelle à toute silhouette.

## 11. Le premier prototype que je construirais

**Une quincaillerie, une caisse de ressorts, un survivant récurrent et une embuscade au retour.** Comparer deux variantes de sortie : le conflit a lieu autour du lot sur place, ou le butin est obtenu sans opposition puis convoité sur la route. L’enjeu est de vérifier que l’on fait réellement des choix différents, sans développer toute une seconde moitié de jeu.

### Contenu exact

1. Une arrivée avec le survivant déjà présent près d’un lot pris dans les ressources du lieu.
2. Quatre premières approches : partager, échanger, proposer les rondelles, insister.
3. Une escalade après « insister » : le survivant refuse, et l’on peut céder ou entrer dans une confrontation courte. La violence n’est pas déclenchée à la place du joueur.
4. Un seul mini-jeu, les rondelles, et une seule confrontation par décisions.
5. Un résultat qui débite le temps, répartit le lot et mémorise le traitement du survivant.
6. Une seconde rencontre courte un jour ultérieur, différente selon qu’on a partagé, respecté le pari ou menacé.
7. Une variante de retour avec un petit groupe de voisins qui réclame une partie du chargement : céder un lot, négocier ou se dégager. Cette scène remplace la rencontre majeure sur place dans cette variante.
8. Une arrivée effective au refuge après résolution du retour, affichant le chargement conservé, les pertes et ce qu’il permet encore de préparer.

Le lot doit être suffisamment utile pour que renoncer fasse hésiter, sans être indispensable à la survie du soir. Les inconnus venus d’une autre ville fourniront ensuite une seconde variante d’adversaires. Les armes à feu, la conduite libre, l’essence, les systèmes de factions et les dégâts persistants attendent le résultat de ce prototype.

### Ce qu’il faut observer

Sur une première session, puis une session où la personne connaît déjà la rencontre :

- Comprend-elle immédiatement ce qui est disputé et ce qu’elle risque ?
- Son choix dépend-il du temps restant, de ses besoins et de son passif avec le PNJ ?
- Choisit-elle toujours la même option, et pour quelle raison ?
- La perte d’un défi donne-t-elle envie de continuer ou de recommencer la sauvegarde ?
- Le résultat change-t-il une préparation concrète pour la nuit ?
- Se souvient-elle du survivant lors de la seconde rencontre ?
- L’embuscade au retour donne-t-elle envie de protéger le magot par des choix différents, ou donne-t-elle surtout l’impression d’annuler injustement la fouille ?
- Combien de temps réel la scène prend-elle, et à quel moment devient-elle répétitive ?

Si tout le monde joue les rondelles à chaque fois, l’échange manque d’intérêt ou le pari est trop avantageux. Si personne n’ose insister, vérifier si le risque est disproportionné ou simplement incompréhensible. Si les choix changent mais que la préparation du soir reste identique, l’enjeu matériel est trop faible.

## 12. Points d’intégration à prévoir

Ces points servent à rendre la proposition réalisable dans le jeu actuel ; ce n’est pas une demande de refonte.

| Point du code actuel | Changement nécessaire pour le prototype |
| --- | --- |
| [`travelTo`](../src/core/game.ts) applique les cadeaux et le temps perdu avant le dialogue | Préparer une rencontre en attente ; appliquer ses conséquences lorsque son choix est résolu |
| [`LocationScene`](../src/scenes/location.ts) montre une fenêtre avec « OK » | Présenter le lot, les options, leurs coûts et une résolution, puis reprendre la fouille |
| [`TravelScene`](../src/scenes/travel.ts) est une courte transition | Conserver les trajets ordinaires courts ; suspendre le retour pour une embuscade en attente lorsqu’elle est prévue |
| [`returnHome`](../src/core/game.ts) place immédiatement le joueur chez lui avant la transition visuelle | Séparer départ du lieu et arrivée au refuge : résoudre la rencontre de retour avant de sécuriser et décharger le butin |
| [`GameState`](../src/core/types.ts) possède un inventaire global et des drapeaux numériques | Distinguer réserve et chargement ; stocker le lot réservé, la rencontre en attente et le passif minimal du PNJ |
| [`save.ts`](../src/core/save.ts) et [`resumeGame`](../src/scenes/flow.ts) reprennent une sortie directement dans le lieu | Reprendre la rencontre non résolue, sans la passer ni redonner son lot ; migrer les anciennes sauvegardes |
| [`createRng`](../src/core/rng.ts) fournit déjà un hasard reproductible | Fixer le comportement du PNJ à la création de la rencontre ; le rechargement ne retire pas les résultats au sort |
| [`LOCATIONS`](../src/core/data/locations.ts) définit les butins finis | Réserver le lot contesté et le retirer définitivement lors de la résolution, sans doubler une fouille normale |

Le rapport de sortie doit enregistrer les gains et pertes effectifs. L’affichage actuel repose sur une différence positive d’inventaire ; cela ne suffira plus pour expliquer un échange ou un vol.

Garanties à vérifier lors de l’implémentation :

- résoudre deux fois la même rencontre ne dépense et ne donne rien une seconde fois ;
- on ne peut pas fouiller le lot pendant qu’il est disputé ;
- quitter puis revenir ne recrée ni le PNJ, ni le pari, ni le lot déjà réglé ;
- recharger reprend le bon stade de rencontre avec les mises et résultats déjà fixés ;
- les pertes ne peuvent pas vider l’inventaire resté chez soi ou rendre un solde négatif ;
- une sauvegarde pendant une embuscade reprend sur la route, avec le même groupe et le même chargement ; elle ne permet pas d’arriver directement au refuge ;
- toutes les branches respectent le budget de retour et aboutissent à une sortie de scène ;
- la rencontre tient compte du jour et du statut vivant ou absent des voisins ;
- les règles, choix et résultats existent en français et en anglais, avec le son coupé.

## 13. Les choix créatifs qui restent ouverts

Ma recommandation de départ est **un jeu surtout stratégique, avec un défi de précision très court et de la violence occasionnelle**. Les relations donnent du poids aux décisions ; la préparation de la maison reste l’enjeu principal.

Quatre décisions pourront faire évoluer cette direction :

| Question | Choix conseillé pour le premier essai | Ce qu’un autre choix engagerait |
| --- | --- | --- |
| Quelle place donner à l’habileté ? | Une épreuve facultative, échange ou partage disponibles | Des épreuves obligatoires demandent davantage de variété et d’accessibilité |
| Jusqu’où va la violence ? | Conflits non létaux ; armes à feu ensuite | La mort de PNJ exige une continuité de campagne et des règles d’infection explicites |
| Combien de mémoire sociale ? | Un survivant, un service ou un grief mémorisé | Un réseau de relations multiplie les scènes et les cas à maintenir |
| Quel rôle pour la conduite ? | Choix de destination, arrêt, engagement et repli | Une conduite jouable demande son propre plaisir de déplacement, ses collisions et son équilibrage |

### Sources du diagnostic

La description du fonctionnement existant s’appuie sur le [README](../README.md), les [règles de campagne](../src/core/game.ts), les [lieux et butins](../src/core/data/locations.ts), les [coûts de construction](../src/core/data/devices.ts), les scènes de [carte](../src/scenes/map.ts), de [trajet](../src/scenes/travel.ts) et de [fouille](../src/scenes/location.ts), ainsi que les [dialogues français](../src/i18n/fr.ts). Le [concept](CONCEPT.md) et le [lore](LORE.md) cadrent le ton et les questions narratives ouvertes ; le README et le code décrivent les règles effectivement construites depuis ces documents initiaux.
