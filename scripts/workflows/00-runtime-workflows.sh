#!/bin/bash

# R18 PHASE A: Critical Workflow Inventory
# Maps each workflow to required capabilities at each step

cat > /tmp/workflow-capabilities.json << 'WORKFLOWS'
{
  "workflows": [
    {
      "name": "Engagement Lifecycle",
      "steps": [
        {"operation": "createEngagement", "capability": "ENGAGEMENT_CREATE", "route": "POST /api/engagements"},
        {"operation": "updateEngagement", "capability": "ENGAGEMENT_UPDATE", "route": "PATCH /api/engagements/[id]"},
        {"operation": "blockEngagement", "capability": "ENGAGEMENT_UPDATE", "route": "POST /api/engagements/[id]/block"},
        {"operation": "transitionPhase", "capability": "INTERVENTION_MANAGE", "route": "POST /api/engagements/[id]/phase"}
      ]
    },
    {
      "name": "Decision Lifecycle",
      "steps": [
        {"operation": "createDecision", "capability": "DECISION_CREATE", "route": "POST /api/decisions"},
        {"operation": "approveDecision", "capability": "DECISION_APPROVE", "route": "POST /api/decisions/[id]/approve"},
        {"operation": "rejectDecision", "capability": "DECISION_REJECT", "route": "POST /api/decisions/[id]/reject"},
        {"operation": "closeDecision", "capability": "DECISION_CLOSE", "route": "POST /api/decisions/[id]/close"}
      ]
    },
    {
      "name": "Action Lifecycle",
      "steps": [
        {"operation": "createAction", "capability": "ACTION_CREATE", "route": "POST /api/actions"},
        {"operation": "updateActionStatus", "capability": "ACTION_UPDATE", "route": "PATCH /api/actions/[id]"},
        {"operation": "completeAction", "capability": "ACTION_UPDATE", "route": "POST /api/actions/[id]/complete"}
      ]
    },
    {
      "name": "Billing Lifecycle",
      "steps": [
        {"operation": "viewEntitlements", "capability": "SYSTEM_VIEW", "route": "GET /api/billing/plan"},
        {"operation": "upgradePlan", "capability": "SYSTEM_ADMIN", "route": "POST /api/billing/upgrade"},
        {"operation": "recordBillingEvent", "capability": "SYSTEM_ADMIN", "route": "POST /api/billing/event"}
      ]
    },
    {
      "name": "Recommendation Lifecycle",
      "steps": [
        {"operation": "createRecommendation", "capability": "RECOMMENDATION_CREATE", "route": "POST /api/recommendations"},
        {"operation": "approveRecommendation", "capability": "RECOMMENDATION_APPROVE", "route": "PATCH /api/recommendations/[id]"},
        {"operation": "viewRecommendation", "capability": "RECOMMENDATION_VIEW", "route": "GET /api/recommendations/[id]"}
      ]
    },
    {
      "name": "Deliverable Lifecycle",
      "steps": [
        {"operation": "createDeliverable", "capability": "DELIVERABLE_CREATE", "route": "POST /api/deliverables"},
        {"operation": "submitVersion", "capability": "DELIVERABLE_SUBMIT_VERSION", "route": "POST /api/deliverables/[id]/version"},
        {"operation": "approveDeliverable", "capability": "DELIVERABLE_APPROVE", "route": "POST /api/deliverables/[id]/approve"}
      ]
    }
  ]
}
WORKFLOWS

echo "✅ Workflow capability mapping generated"
cat /tmp/workflow-capabilities.json | jq '.' > /home/user/OPsIq/workflow-capabilities.json
echo "Total workflows: $(jq '.workflows | length' /tmp/workflow-capabilities.json)"
echo "Total steps: $(jq '[.workflows[].steps[] | .capability] | length' /tmp/workflow-capabilities.json)"
