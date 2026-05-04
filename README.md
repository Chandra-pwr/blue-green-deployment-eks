# Zero-Downtime Blue-Green Deployment on AWS EKS

> Deploy with confidence. Switch traffic instantly. Roll back in seconds.

![Kubernetes](https://img.shields.io/badge/Kubernetes-326CE5?style=flat&logo=kubernetes&logoColor=white)
![AWS EKS](https://img.shields.io/badge/AWS%20EKS-FF9900?style=flat&logo=amazonwebservices&logoColor=white)
![Helm](https://img.shields.io/badge/Helm-0F1689?style=flat&logo=helm&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)
![NGINX](https://img.shields.io/badge/NGINX-009639?style=flat&logo=nginx&logoColor=white)

---

## What This Project Does

This project implements a **production-grade Blue-Green deployment pipeline** on AWS EKS. Instead of taking your app offline during updates, you run two environments in parallel and flip traffic between them — no downtime, no risk.
Users → Ingress → [ 🔵 Blue (v1) ]  ← traffic before switch
[ 🟢 Green (v2) ]  ← traffic after switch

**Why Blue-Green?**
- Zero downtime during deployments
- Instant rollback if something goes wrong
- Safe way to test v2 before exposing it to users

---

## Architecture
                    ┌─────────────────────────────┐
                    │         AWS EKS Cluster      │
                    │                              │
Internet ──▶ ELB ──▶ NGINX Ingress ──▶ Service (selector: version=blue/green)
│                    │
│         ┌──────────┴──────────┐
│         │                     │
│   🔵 Blue Pods (v1)    🟢 Green Pods (v2)
│   Deployment              Deployment
└─────────────────────────────┘

Traffic switching happens at the **Service selector level** — no pod restarts, no downtime.

---

## Prerequisites

Complete all of these before starting. Skipping any step will cause failures later.

### 1. AWS Account Setup

You need an IAM user with programmatic access.

- [Create an IAM user](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_users_create.html) with `AdministratorAccess` (or minimum EKS permissions)
- Save the **Access Key ID** and **Secret Access Key**

### 2. Install Required Tools

| Tool | Install Guide | Verify |
|------|--------------|--------|
| AWS CLI v2 | [docs.aws.amazon.com](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html) | `aws --version` |
| kubectl | [kubernetes.io](https://kubernetes.io/docs/tasks/tools/) | `kubectl version --client` |
| Helm v3 | [helm.sh](https://helm.sh/docs/intro/install/) | `helm version` |
| Docker | [docs.docker.com](https://docs.docker.com/get-docker/) | `docker --version` |

Run this to confirm everything is installed:

```bash
aws --version && kubectl version --client && helm version && docker --version
```

### 3. Configure AWS CLI

```bash
aws configure
```

You'll be prompted for:
- `AWS Access Key ID` — from your IAM user
- `AWS Secret Access Key` — from your IAM user
- `Default region` — e.g. `ap-south-1` (Mumbai)
- `Default output format` — `json`

### 4. An Existing EKS Cluster

This project assumes you already have an EKS cluster running. If not:

```bash
# Install eksctl
# https://eksctl.io/installation/

eksctl create cluster \
  --name my-cluster \
  --region ap-south-1 \
  --nodegroup-name standard-workers \
  --node-type t3.medium \
  --nodes 2
```

> ⚠️ Cluster creation takes 10–15 minutes.

---

## Project Structure
.
├── bluegreen-app/           # Helm chart for the application
│   ├── Chart.yaml
│   ├── values.yaml          # Default values (blue, v1)
│   └── templates/
│       ├── deployment.yaml
│       ├── service.yaml
│       └── ingress.yaml
├── app/                     # Application source code
│   └── Dockerfile
└── README.md

---

## Step-by-Step Deployment Guide

### Step 1 — Connect kubectl to Your EKS Cluster

```bash
aws eks update-kubeconfig --region <region> --name <cluster-name>
```

**Example:**
```bash
aws eks update-kubeconfig --region ap-south-1 --name my-cluster
```

Verify the connection:

```bash
kubectl get nodes
```

Expected output — you should see your nodes with `STATUS = Ready`:
NAME                                        STATUS   ROLES    AGE
ip-192-168-xx-xx.ap-south-1.compute.internal   Ready    <none>   5m
ip-192-168-xx-xx.ap-south-1.compute.internal   Ready    <none>   5m

> ❌ **Nothing showing?** Run `kubectl config get-contexts` and switch to the correct context with `kubectl config use-context <name>`.

---

### Step 2 — Build and Push Docker Images

Run these from the **root of the project**:

```bash
# Build both versions
docker build -t yourdockerhub/app:v1 .
docker build -t yourdockerhub/app:v2 .

# Log in to Docker Hub
docker login

# Push both images
docker push yourdockerhub/app:v1
docker push yourdockerhub/app:v2
```

Replace `yourdockerhub` with your actual Docker Hub username.

Verify images exist locally:

```bash
docker images | grep app
```

> ❌ **ImagePullBackOff later?** Your images aren't public or didn't push. Re-run the push commands above.

---

### Step 3 — Install the NGINX Ingress Controller

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml
```

Wait for all Ingress pods to reach `Running` state:

```bash
kubectl get pods -n ingress-nginx --watch
```

Expected output:
NAME                                        READY   STATUS    RESTARTS
ingress-nginx-controller-xxxxxxxxxx-xxxxx   1/1     Running   0

> ⏳ This can take 1–3 minutes. Press `Ctrl+C` once all pods are Running.

---

### Step 4 — Deploy the Blue Environment (v1)

```bash
cd bluegreen-app
helm install myapp .
```

Verify everything is up:

```bash
kubectl get pods
kubectl get svc
```

Expected pods:
NAME                          READY   STATUS    RESTARTS
myapp-blue-xxxxxxxxxx-xxxxx   1/1     Running   0

---

### Step 5 — Access the Application

```bash
kubectl get svc
```

Find the service with `TYPE = LoadBalancer` and copy the `EXTERNAL-IP`.
NAME          TYPE           CLUSTER-IP     EXTERNAL-IP                          PORT(S)
bluegreen-app LoadBalancer   10.100.xx.xx   xxx.ap-south-1.elb.amazonaws.com     80:xxxxx/TCP

Open in browser:
http://<EXTERNAL-IP>

You should see: **Running Version v1** 🔵

> ⏳ **No EXTERNAL-IP yet?** It takes 2–3 minutes for AWS to provision the Load Balancer. Re-run `kubectl get svc` after waiting.

---

### Step 6 — Deploy the Green Environment (v2)

While Blue is still serving traffic, deploy v2 alongside it:

```bash
helm upgrade myapp . --set image.tag=v2 --set version=green
```

Verify both versions are running simultaneously:

```bash
kubectl get pods --show-labels
```

Expected output:
NAME                           READY   STATUS    LABELS
myapp-blue-xxxxxxxxx-xxxxx     1/1     Running   version=blue
myapp-green-xxxxxxxxx-xxxxx    1/1     Running   version=green

> ✅ Both pods running means you're ready to switch — Blue is still live, Green is on standby.

---

### Step 7 — Switch Traffic to Green (Zero Downtime)

This single command redirects 100% of traffic from Blue to Green:

```bash
kubectl patch svc bluegreen-app -p '{"spec":{"selector":{"version":"green"}}}'
```

Refresh your browser:
http://<EXTERNAL-IP>

You should now see: **Running Version v2** 🟢

No downtime. No restarts. Traffic switched instantly.

---

### Step 8 — Rollback (if needed)

If v2 has issues, roll back to v1 in one command:

```bash
helm rollback myapp 1
```

Then switch traffic back to Blue:

```bash
kubectl patch svc bluegreen-app -p '{"spec":{"selector":{"version":"blue"}}}'
```

Refresh browser → back to **v1** 🔵

---

## Cleanup

To avoid AWS charges, delete resources when you're done:

```bash
# Uninstall Helm release
helm uninstall myapp

# Delete Ingress controller
kubectl delete -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml

# Delete EKS cluster (if you created one for this project)
eksctl delete cluster --name my-cluster --region ap-south-1
```

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `kubectl get nodes` returns nothing | Wrong kubeconfig context | Run `kubectl config use-context <cluster-name>` |
| Pods stuck in `Pending` | Insufficient node resources | Check `kubectl describe pod <pod-name>` for resource errors |
| `ImagePullBackOff` | Image not pushed or private | Re-push image; check Docker Hub visibility |
| No `EXTERNAL-IP` | Load Balancer still provisioning | Wait 2–3 minutes; re-run `kubectl get svc` |
| Traffic not switching after patch | Selector not updated | Run `kubectl get svc bluegreen-app -o yaml` and verify the selector |
| `Error: INSTALLATION FAILED` on Helm | Release name already exists | Run `helm uninstall myapp` first, then re-install |

---

## Key Concepts Covered

- **Blue-Green Deployments** — running two environments in parallel to eliminate downtime
- **Kubernetes Service Selectors** — how traffic routing works at the pod label level
- **Helm** — packaging and managing Kubernetes applications
- **AWS EKS** — managed Kubernetes on AWS
- **NGINX Ingress** — routing external traffic into the cluster
- **Rollback Strategy** — reverting to a previous release instantly

---
