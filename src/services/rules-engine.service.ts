import { Asset, AssetCategory, WorkOrder } from '@prisma/client';

export interface PredictiveRiskEvaluation {
  riskScore: number; // 0 to 100
  riskBand: 'low' | 'medium' | 'high' | 'critical';
  riskReasons: string[];
  recommendedAction: 'monitor' | 'schedule_inspection' | 'preventive_maintenance' | 'replacement_review';
  evaluatedAt: string;
  source: 'deterministic_rules_engine' | 'ai_model';
}

/**
 * Deterministic Rules Engine Baseline for Asset Maintenance & Failure Risk
 * Computes explainable risk bands and reasons based on:
 * 1. Asset age vs. Category useful life
 * 2. Recent corrective failure count (in last 180 days)
 * 3. Cumulative downtime hours
 * 4. Total repair costs vs. original purchase cost
 * 5. Maintenance overdue status
 */
export function evaluateAssetRisk(
  asset: Asset & {
    category: AssetCategory;
    workOrders: WorkOrder[];
  }
): PredictiveRiskEvaluation {
  let score = 0;
  const reasons: string[] = [];
  const now = new Date();

  // 1. Asset Age vs. Expected Useful Life (usefulLifeMonths)
  if (asset.purchaseDate) {
    const purchaseDate = new Date(asset.purchaseDate);
    const ageMonths = (now.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
    const expectedLife = asset.category.usefulLifeMonths || 36;
    const lifeRatio = ageMonths / expectedLife;

    if (lifeRatio >= 1.2) {
      score += 35;
      reasons.push(`Asset has exceeded expected useful life (${Math.round(ageMonths)}/${expectedLife} months)`);
    } else if (lifeRatio >= 0.9) {
      score += 20;
      reasons.push(`Asset is approaching end of expected useful life (${Math.round(ageMonths)}/${expectedLife} months)`);
    }
  }

  // 2. Failure count in last 180 days
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const recentOrders = asset.workOrders.filter(
    (wo) => new Date(wo.createdAt) >= sixMonthsAgo
  );
  const failureOrders = recentOrders.filter(
    (wo) => wo.outcome === 'repaired' || wo.outcome === 'replaced_parts' || wo.outcome === 'unresolvable'
  );

  if (failureOrders.length >= 3) {
    score += 35;
    reasons.push(`High failure frequency: ${failureOrders.length} repairs recorded in the last 180 days`);
  } else if (failureOrders.length >= 1) {
    score += 15;
    reasons.push(`Recent service failure recorded (${failureOrders.length} service event in last 180 days)`);
  }

  // 3. Cumulative Downtime
  const totalDowntimeHours = asset.workOrders.reduce((sum, wo) => {
    return sum + (wo.downtimeHours ? Number(wo.downtimeHours) : 0);
  }, 0);

  if (totalDowntimeHours >= 48) {
    score += 20;
    reasons.push(`Critical cumulative downtime accumulated (${totalDowntimeHours} hours)`);
  } else if (totalDowntimeHours >= 16) {
    score += 10;
    reasons.push(`Moderate downtime accumulated (${totalDowntimeHours} hours)`);
  }

  // 4. Cumulative Repair Cost vs. Original Purchase Cost
  if (asset.purchaseCost && Number(asset.purchaseCost) > 0) {
    const totalRepairCost = asset.workOrders.reduce((sum, wo) => {
      return sum + (wo.cost ? Number(wo.cost) : 0);
    }, 0);

    const costRatio = totalRepairCost / Number(asset.purchaseCost);
    if (costRatio >= 0.6) {
      score += 30;
      reasons.push(`Cumulative repair cost is high (${Math.round(costRatio * 100)}% of original purchase cost)`);
    } else if (costRatio >= 0.3) {
      score += 15;
      reasons.push(`Substantial repair investment incurred (${Math.round(costRatio * 100)}% of purchase cost)`);
    }
  }

  // 5. Active / Overdue Work Orders
  const overdueWorkOrders = asset.workOrders.filter((wo) => {
    return wo.dueDate && new Date(wo.dueDate) < now && wo.status !== 'completed' && wo.status !== 'cancelled';
  });

  if (overdueWorkOrders.length > 0) {
    score += 25;
    reasons.push(`${overdueWorkOrders.length} maintenance work order(s) are currently overdue`);
  }

  // Cap score at 100
  const finalScore = Math.min(100, Math.max(0, score));

  // Determine Risk Band
  let riskBand: PredictiveRiskEvaluation['riskBand'] = 'low';
  let recommendedAction: PredictiveRiskEvaluation['recommendedAction'] = 'monitor';

  if (finalScore >= 75) {
    riskBand = 'critical';
    recommendedAction = 'replacement_review';
  } else if (finalScore >= 50) {
    riskBand = 'high';
    recommendedAction = 'preventive_maintenance';
  } else if (finalScore >= 25) {
    riskBand = 'medium';
    recommendedAction = 'schedule_inspection';
  }

  if (reasons.length === 0) {
    reasons.push('Asset operating within standard parameters; no immediate failure risk indicators');
  }

  return {
    riskScore: finalScore,
    riskBand,
    riskReasons: reasons,
    recommendedAction,
    evaluatedAt: new Date().toISOString(),
    source: 'deterministic_rules_engine',
  };
}
