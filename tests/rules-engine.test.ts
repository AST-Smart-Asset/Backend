import { evaluateAssetRisk } from '../src/services/rules-engine.service';

describe('Predictive Maintenance Rules Engine (AST-FR-09)', () => {
  const mockCategory: any = {
    id: 'cat-1',
    code: 'CAT-SERVER',
    name: 'Servers',
    usefulLifeMonths: 36,
    requiresSerial: true,
  };

  test('Nominal asset with no repairs scores low risk', () => {
    const mockAsset: any = {
      id: 'asset-1',
      assetTag: 'AST-SRV-001',
      categoryId: 'cat-1',
      purchaseDate: new Date(),
      purchaseCost: 10000,
      condition: 'good',
      status: 'in_service',
      category: mockCategory,
      workOrders: [],
    };

    const result = evaluateAssetRisk(mockAsset);
    expect(result.riskBand).toBe('low');
    expect(result.riskScore).toBeLessThan(25);
    expect(result.recommendedAction).toBe('monitor');
    expect(result.source).toBe('deterministic_rules_engine');
  });

  test('Asset exceeding useful life and multiple repairs triggers high or critical risk', () => {
    const oldDate = new Date();
    oldDate.setMonth(oldDate.getMonth() - 50); // 50 months old vs 36 expected

    const mockAsset: any = {
      id: 'asset-2',
      assetTag: 'AST-SRV-002',
      categoryId: 'cat-1',
      purchaseDate: oldDate,
      purchaseCost: 5000,
      condition: 'fair',
      status: 'in_service',
      category: mockCategory,
      workOrders: [
        {
          id: 'wo-1',
          createdAt: new Date(),
          outcome: 'repaired',
          cost: 1500,
          downtimeHours: 20,
          status: 'completed',
        },
        {
          id: 'wo-2',
          createdAt: new Date(),
          outcome: 'replaced_parts',
          cost: 2000,
          downtimeHours: 30,
          status: 'completed',
        },
        {
          id: 'wo-3',
          createdAt: new Date(),
          outcome: 'repaired',
          cost: 500,
          downtimeHours: 10,
          status: 'completed',
        },
      ],
    };

    const result = evaluateAssetRisk(mockAsset);
    expect(['high', 'critical']).toContain(result.riskBand);
    expect(result.riskScore).toBeGreaterThanOrEqual(50);
    expect(result.riskReasons.length).toBeGreaterThanOrEqual(3);
    expect(['preventive_maintenance', 'replacement_review']).toContain(result.recommendedAction);
  });
});
