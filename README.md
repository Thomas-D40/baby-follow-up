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
