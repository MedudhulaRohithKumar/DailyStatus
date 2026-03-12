# AWS EKS Deployment Fixes and Domain Configuration

This document summarizes the issues identified, the steps taken, and the commands executed to successfully deploy the **DailyStatus** application on AWS EKS and expose it to the public internet using your custom domain (`conceptsofcloud.com`).

---

## 1. Manual Kubernetes Deployment
**Issue:** The AWS CodePipeline was configured with the `ECRBuildAndPublish` action instead of AWS CodeBuild. As a result, it successfully built and pushed the Docker image to ECR but never ran the `kubernetes apply` commands in your `buildspec.yml`.

**Fix:** We manually applied the Kubernetes deployment using the latest uploaded Docker image.

```bash
# Copied deployment to temp file and injected the latest ECR Image URI
cp k8s/deployment.yaml /tmp/deployment.yaml
sed -i '' "s|\$IMAGE_URI|384722508819.dkr.ecr.ap-south-2.amazonaws.com/daily-status:latest|g" /tmp/deployment.yaml

# Deployed the resources to EKS
kubectl apply -f /tmp/deployment.yaml
kubectl apply -f k8s/service.yaml
```

---

## 2. Resolving Missing Kubernetes Secrets
**Issue:** The application pods were failing to start due to a `CreateContainerConfigError`. The deployment referenced a Kubernetes Secret named `app-secrets` (specifically the `jwt_secret` key), which did not exist in the cluster.

**Fix:** We created the missing secret using the value defined in your local `.env` file and restarted the failing pods.

```bash
# Create the missing secret
kubectl create secret generic app-secrets --from-literal=jwt_secret=supersecret123

# Delete the failing pods to force a recreation
kubectl delete pods -l app=daily-status
```
**Output Details:**
```text
secret/app-secrets created
pod "daily-status-deployment-f59778f6c-gsjsc" deleted
pod "daily-status-deployment-f59778f6c-p2fsj" deleted
```
*(The newly spawned pods transitioned to a healthy `Running` state within seconds).*

---

## 3. Configuring the Internet-Facing Load Balancer
**Issue:** The `service.yaml` correctly requested a LoadBalancer. However, by default, EKS provisions an **internal** Load Balancer which cannot be accessed from the public internet, causing connection timeouts (`ERR_CONNECTION_TIMED_OUT`).

**Fix:** 
1. **Tagged VPC Subnets:** AWS requires public subnets to explicitly declare they allow public load balancers via a specific tag (`kubernetes.io/role/elb=1`).
   ```bash
   aws ec2 create-tags \
     --resources subnet-0a13daf06cb0fd8e7 subnet-072cb2030f17e89ba subnet-07e07dc96054325c3 \
     --tags Key=kubernetes.io/role/elb,Value=1
   ```

2. **Modified `k8s/service.yaml`:** We added the necessary AWS load balancer annotations to request an `internet-facing` NLB.
   ```yaml
   # Added to metadata in k8s/service.yaml
   annotations:
     service.beta.kubernetes.io/aws-load-balancer-scheme: internet-facing
     service.beta.kubernetes.io/aws-load-balancer-type: external
     service.beta.kubernetes.io/aws-load-balancer-nlb-target-type: ip
   ```

3. **Redeployed the Service:** We deleted the old internal load balancer and applied the updated service definition to provision the new public one.
   ```bash
   kubectl delete svc daily-status-service 
   kubectl apply -f k8s/service.yaml
   ```
*(This generated the new public URL: `k8s-default-dailysta-8ca863a538-5c7d5e3a08fd2681.elb.ap-south-2.amazonaws.com`)*

---

## 4. Mapping the Custom Domain (Route 53)
**Issue:** The final step was mapping your custom domain `conceptsofcloud.com` to the new Load Balancer URL.

**Fix:** We utilized AWS Route 53 to construct a DNS change batch that mapped both `conceptsofcloud.com` and `www.conceptsofcloud.com` as an `Alias A Record` directly to the Network Load Balancer.

```bash
# Created a JSON payload defining the Alias records
# Executed the UPSERT change batch against your Hosted Zone
aws route53 change-resource-record-sets \
  --hosted-zone-id Z014782816CHHKXWP4AH5 \
  --change-batch file:///tmp/route53-change.json
```

**Verification:**
```bash
curl -I http://conceptsofcloud.com
```
**Output:**
```text
HTTP/1.1 200 OK
X-Powered-By: Express
Content-Type: text/html; charset=utf-8
...
```

**Conclusion:** The application is completely functional, integrated with EKS load balancing, and reachable through the user's custom root domain.
