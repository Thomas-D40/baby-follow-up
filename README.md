# Suivi Baby

Suivi quotidien d'un bébé (biberons, siestes, selles) avec vue calendrier, pour 2 parents.

## Stack

- **Front** : React (Vite) + TanStack Query — PWA installable, statique servi par Caddy.
- **Back** : Quarkus 3.33 LTS (JVM, **JDK 25**) + Hibernate ORM Panache + Liquibase + security-jpa (auth cookie form-auth).
- **Données** : PostgreSQL.
- **Infra** : Hostinger VPS KVM2 (FR/UE), docker-compose, Caddy (TLS auto).
- **CI/CD** : GitHub Actions → GHCR → déploiement SSH.

## Structure (mono-repo)

```
api/    Quarkus + Liquibase
web/    React (Vite) — bundle statique
infra/  docker-compose.yml + Caddyfile
.github/workflows/  deploy.yml
```

## Développement local

> Prérequis : **JDK 25** (Temurin) et **Docker** (Dev Services lance un Postgres jetable).

```bash
# Back (Quarkus dev mode : Postgres auto via Dev Services, nécessite Docker)
cd api && ./mvnw quarkus:dev

# Front (Vite, proxy /api -> :8080)
cd web && npm install && npm run dev
```

## Déploiement

Sur push `main` : GitHub Actions build l'image API (→ GHCR) + le bundle front,
puis déploie sur le VPS. La composition de déploiement vit dans `infra/`
(`docker-compose.yml`, `Caddyfile`) ; les secrets (BDD, clé de session, admin
bootstrap…) sont injectés via les **GitHub Actions Secrets**, jamais committés.

### Mails (activation, invitations)

L'API envoie ses mails via le service `mail` de `infra/docker-compose.yml`
(Postfix + signature DKIM, image `boky/postfix`) : il n'écoute que sur le réseau
compose (587, aucun port publié) et livre directement aux destinataires sur le
port 25. Tant que `MAIL_ENABLED` vaut `false` (défaut), rien ne part et le lien
reste affiché à l'écran.

Mise en service, une fois :

1. **Port 25 sortant** — depuis le VPS : `nc -vz -w 5 gmail-smtp-in.l.google.com 25`.
   S'il est bloqué, demander son ouverture au support Hostinger.
2. **Reverse DNS (PTR)** — hPanel → VPS → Paramètres → adresse IP : PTR = le domaine
   (`DOMAIN`), qui doit lui-même pointer (A) sur l'IP du VPS.
3. **DNS du domaine** :
   - SPF : `TXT @` → `v=spf1 ip4:<IP du VPS> -all` (fusionner s'il existe déjà un SPF) ;
   - DKIM : `TXT mail._domainkey` → la valeur affichée par
     `docker compose exec mail cat /var/lib/rspamd/dkim/<DOMAIN>.mail.txt`
     (clé générée au premier démarrage, conservée dans le volume `dkim_keys`) ;
   - DMARC : `TXT _dmarc` → `v=DMARC1; p=quarantine; rua=mailto:<votre adresse>`.
4. Passer `MAIL_ENABLED=true` puis redéployer ; vérifier la note sur
   [mail-tester.com](https://www.mail-tester.com) avec un mail d'invitation.

Expéditeur par défaut : `Suivi Baby <no-reply@DOMAIN>` (`MAIL_FROM` pour changer).
Pour passer plutôt par un relais externe : `SMTP_HOST`, `SMTP_USERNAME`,
`SMTP_PASSWORD` et `SMTP_START_TLS=REQUIRED`.
