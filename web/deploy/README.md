# Déploiement — quadrature.marechal-gao.fr

Le site public est un **export statique** servi par nginx derrière le Traefik du
VPS. Aucun process Node en production : il n'y a qu'un dossier de fichiers.

```
GitHub (push sur master)
   └─ .github/workflows/deploy.yml
        ├─ npm run build:public   → web/out/
        └─ rsync                  → VPS:~/apps/quadrature-deploy/www/
                                        ▲
                                        └─ monté en lecture seule dans nginx:alpine
```

Le déploiement passe **toujours** par la CI, jamais par une machine de
développement : c'est ce qui garantit que les rapports de combat locaux
(`simulator/combatReports/`, gitignoré) ne peuvent pas se retrouver en ligne.

---

## Mise en place initiale (une seule fois)

### 1. Sur le VPS

```bash
mkdir -p ~/apps/quadrature-deploy/www
```

Copier `docker-compose.yml` et `nginx.conf` de ce dossier vers
`~/apps/quadrature-deploy/`, puis démarrer le conteneur :

```bash
cd ~/apps/quadrature-deploy && docker compose up -d
```

Traefik détecte le nouveau service par ses labels et demande le certificat
Let's Encrypt automatiquement. Le sous-domaine `quadrature.marechal-gao.fr`
résout déjà vers le VPS (enregistrement générique) — rien à faire côté DNS.

À ce stade `www/` est vide : le site répondra 404 jusqu'au premier déploiement.

### 2. Clé de déploiement

Générer une paire dédiée à la CI (ne pas réutiliser une clé personnelle) :

```bash
ssh-keygen -t ed25519 -C "github-actions-quadrature" -f ~/.ssh/quadrature-deploy
```

Autoriser la clé **publique** sur le VPS :

```bash
ssh-copy-id -i ~/.ssh/quadrature-deploy.pub debian@51.210.102.237
```

### 3. Secrets GitHub

Dans **Settings → Secrets and variables → Actions** :

| Secret | Valeur |
| :----- | :----- |
| `VPS_SSH_KEY` | contenu de `~/.ssh/quadrature-deploy` (clé **privée**) |
| `VPS_HOST` | `51.210.102.237` |
| `VPS_USER` | `debian` |
| `VPS_KNOWN_HOSTS` | sortie de `ssh-keyscan 51.210.102.237` |

`VPS_KNOWN_HOSTS` n'est pas une formalité : sans elle, il faudrait désactiver la
vérification de l'hôte, et la CI livrerait ses fichiers à n'importe quel serveur
répondant à cette adresse.

---

## Au quotidien

Un push sur `master` déclenche le build et la synchronisation. Le workflow
s'arrête avant de publier si l'export contient les routes de l'outil local, et
vérifie en fin de course que le site répond bien 200.

Pour republier sans nouveau commit : onglet **Actions** → *Déploiement* →
*Run workflow*.

---

## Fichiers

| Fichier | Rôle |
| :------ | :--- |
| `docker-compose.yml` | Service nginx + labels Traefik (hôte, TLS) |
| `nginx.conf` | Racine, gzip, cache des assets hashés, page 404 |

Les deux vivent sur le VPS dans `~/apps/quadrature-deploy/`. Après les avoir
modifiés ici, il faut les y recopier et relancer `docker compose up -d` — la CI
ne synchronise que le contenu du site, pas sa configuration de service.
