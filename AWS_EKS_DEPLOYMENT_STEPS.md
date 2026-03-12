# DailyStatus — Full Application Walkthrough

## 1. Application Overview

**DailyStatus** is a team status tracking tool for a DevOps team. Every registered team member can:
- Register / Log in / Reset password
- Submit their daily work status (Worked On, Leave, WFO Exception)
- View the **entire team's status** on a shared dashboard (same view for everyone)

---

## 2. Application Flow

```
User visits conceptsofcloud.com
    │
    ├─► Has JWT in localStorage?
    │       No  ─► Login Page (index.html)  ─► Register / Login ─► JWT saved to localStorage
    │       Yes ─► Dashboard (dashboard.html)
    │
Dashboard:
    │
    ├─► GET /api/status?date=YYYY-MM-DD
    │       ─► Returns ALL users + their statuses for the selected date
    │       ─► Users with no submission show as "Not Updated"
    │
    └─► User clicks "Update My Status"
            ─► Modal opens (prepopulated if status already submitted today)
            ─► POST /api/status  ─► Upserts record in DB
            ─► Table refreshes for everyone
```

### Pages
| Page | File | Purpose |
|---|---|---|
| Login / Register / Reset | `public/index.html` | Auth entry point |
| Team Dashboard | `public/dashboard.html` | Shared team status board |
| Frontend Logic | `public/js/app.js` | All JavaScript (auth + dashboard) |

### API Endpoints
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/register` | No | Create new account |
| `POST` | `/api/login` | No | Returns JWT token |
| `POST` | `/api/reset-password` | No | Reset own password |
| `GET` | `/api/status?date=` | JWT | Fetch all users + statuses for date |
| `POST` | `/api/status` | JWT | Submit or update own status |

---

## 3. Database Schema (PostgreSQL — AWS RDS)

### `users` table
```sql
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50)  UNIQUE NOT NULL,   -- Employee ID e.g. 2806487
  password_hash VARCHAR(255) NOT NULL,           -- bcrypt hashed
  full_name     VARCHAR(100) NOT NULL,
  role          VARCHAR(20)  DEFAULT 'user'
);
```

### `daily_status` table
```sql
CREATE TABLE daily_status (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  date        DATE    NOT NULL,
  status_type VARCHAR(20) NOT NULL,  -- 'Worked On' | 'Leave' | 'WFO Exception' | 'Not Updated'
  description TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, date)              -- One status per user per day; supports safe upsert
);
```

**Key design:** The `GET /api/status` endpoint fetches ALL users, then merges with submitted statuses for the day. Users who haven't submitted appear as `Not Updated` — ensuring the dashboard always shows the full team.

---

## 4. AWS Infrastructure

```
GitHub (main branch)
    │ push
    ▼
AWS CodePipeline
    │ build + push image
    ▼
Amazon ECR
(384722508819.dkr.ecr.ap-south-2.amazonaws.com/daily-status:latest)
    │ kubectl rollout restart (manual trigger)
    ▼
Amazon EKS Cluster (daily-status-cluster, ap-south-2)
    2 × Node.js Pod replicas
    │
    ▼
Network Load Balancer (internet-facing)
k8s-default-dailysta-8ca863a538-5c7d5e3a08fd2681.elb.ap-south-2.amazonaws.com
    │
    ▼
Route 53 Alias Record
conceptsofcloud.com / www.conceptsofcloud.com
    │
    ▼
AWS RDS PostgreSQL
database-2.czy2oyiuyin3.ap-south-2.rds.amazonaws.com
Database: daily_status_db
```

### Kubernetes Secrets
| Secret Name | Keys | Purpose |
|---|---|---|
| `db-credentials` | `host`, `username`, `password`, `database` | RDS connection |
| `app-secrets` | `jwt_secret` | JWT signing key |

---

## 5. EKS Deployment Issues & Fixes

### Issue 1 — CodePipeline Only Pushed to ECR, Never Deployed
**Problem:** Pipeline used `ECRBuildAndPublish` action — it built and pushed the image to ECR but never ran `kubectl apply`, so the cluster never updated.

**Fix:** Manually apply the deployment using the latest image:
```bash
cp k8s/deployment.yaml /tmp/deployment.yaml
sed -i '' "s|\$IMAGE_URI|<ECR_URI>:latest|g" /tmp/deployment.yaml
kubectl apply -f /tmp/deployment.yaml
kubectl apply -f k8s/service.yaml
```
Going forward, redeploy using:
```bash
kubectl rollout restart deployment daily-status-deployment
```

---

### Issue 2 — JavaScript Syntax Error in app.js (Line 179)
**Problem:** `Declaration or statement expected` error at line 179. The `if (isLoginPage) {` block was missing from the start of the login page logic section, leaving an orphaned closing `}`.

**Fix:** Added the missing guard:
```javascript
// --- Login Page Logic ---
if (isLoginPage) {
    const loginForm = document.getElementById('login-form');
    // ...
}
```

---

### Issue 3 — `node_modules` Committed to Git (Exec Format Error on Linux)
**Problem:** macOS-compiled native binaries (specifically `sqlite3`) were committed to Git. The `COPY . .` step in the Dockerfile overwrote the Linux binaries built during `npm install`, causing pods to crash:
```
Error: Error loading shared library node_sqlite3.node: Exec format error
```

**Fix:**
```bash
# Created .dockerignore
echo "node_modules" > .dockerignore

# Removed node_modules from Git history
git rm -r --cached node_modules
git commit -m "Remove node_modules from git"
```

---

### Issue 4 — Pods Used SQLite Instead of PostgreSQL (Data Lost on Restart)
**Problem:** The `.env` file (containing `DB_TYPE=sqlite`) was baked into the Docker image. When `dotenv` loaded it inside the pod, it **overrode** the Kubernetes RDS environment variables. Every pod was writing to a local in-pod SQLite file — all data was wiped on every restart.

**Fix:** Added `.env` to `.dockerignore`:
```
node_modules
.git
.env
```
Pods now exclusively use env vars injected by Kubernetes secrets.

---

### Issue 5 — RDS Rejected Connections (No SSL Encryption)
**Problem:** Once pods correctly connected to RDS over PostgreSQL, RDS rejected:
```
FATAL: no pg_hba.conf entry for host "172.31.x.x", user "postgres", no encryption
```
AWS RDS requires SSL by default.

**Fix:** Added SSL to the PostgreSQL pool in `src/db/index.js`:
```javascript
const pool = new Pool({
  ssl: { rejectUnauthorized: false }  // Required for AWS RDS
});
```

---

### Issue 6 — RDS Database Had No Tables
**Problem:** The `daily_status_db` database in RDS had never had the schema applied — the app had always previously run with SQLite locally.

**Fix:** Created a temporary psql pod in EKS to apply the schema directly to RDS:
```bash
kubectl run psql-client --image=postgres:15 --restart=Never ...
kubectl exec psql-client -- psql "...sslmode=require" -c "CREATE TABLE users (...); CREATE TABLE daily_status (...);"
kubectl delete pod psql-client
```

---

### Issue 7 — Fake Seed Users Showing on Dashboard
**Problem:** `seed.js` auto-created 13 fake users (`devops1`–`devops13`) in the SQLite database. Once SQLite was used in EKS, these appeared on the live team dashboard.

**Fix:** RDS was initialized with the schema only — no seed data. Real users register via the web UI.

---

### Issue 8 — Load Balancer Was Internal (Not Publicly Accessible)
**Problem:** EKS provisioned an **internal** NLB, causing `ERR_CONNECTION_TIMED_OUT` from the internet.

**Fix:**
1. Tagged public VPC subnets:
```bash
aws ec2 create-tags \
  --resources subnet-0a13daf06cb0fd8e7 subnet-072cb2030f17e89ba subnet-07e07dc96054325c3 \
  --tags Key=kubernetes.io/role/elb,Value=1
```
2. Added annotations to `k8s/service.yaml`:
```yaml
annotations:
  service.beta.kubernetes.io/aws-load-balancer-scheme: internet-facing
  service.beta.kubernetes.io/aws-load-balancer-type: external
  service.beta.kubernetes.io/aws-load-balancer-nlb-target-type: ip
```
3. Deleted old service and reapplied to provision a new public NLB.

---

### Issue 9 — Missing Kubernetes Secret (`app-secrets`)
**Problem:** Pods failed at startup with `CreateContainerConfigError` because the deployment referenced a secret `app-secrets` (for `JWT_SECRET`) that did not exist.

**Fix:**
```bash
kubectl create secret generic app-secrets --from-literal=jwt_secret=supersecret123
kubectl delete pods -l app=daily-status   # Force pod recreation
```

---

## 6. Current Architecture Status

| Component | Detail |
|---|---|
| Domain | `conceptsofcloud.com` → Route 53 → NLB → EKS |
| Pods | 2 replicas, `node:18-alpine` container |
| Database | AWS RDS PostgreSQL, `daily_status_db`, SSL enabled |
| Auth | JWT signed with `app-secrets/jwt_secret`, 8h expiry |
| Image Registry | ECR — `daily-status:latest` |
| Deploy Process | Push to GitHub → CodePipeline builds image → `kubectl rollout restart` |
| Data Persistence | ✅ Survives pod restarts — stored in RDS |
