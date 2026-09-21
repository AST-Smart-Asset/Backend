import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting comprehensive synthetic seed generator for Smart Asset Inventory (AST)...');

  // 1. Roles
  const rolesData = [
    { code: 'super_admin', name: 'Super Administrator', isSystem: true },
    { code: 'asset_admin', name: 'Asset Administrator', isSystem: true },
    { code: 'procurement_finance', name: 'Procurement & Finance Viewer', isSystem: true },
    { code: 'custodian_manager', name: 'Custodian / Department Manager', isSystem: true },
    { code: 'technician', name: 'Maintenance Technician', isSystem: true },
    { code: 'auditor', name: 'Auditor & Compliance Officer', isSystem: true },
  ];

  const roles: Record<string, any> = {};
  for (const r of rolesData) {
    roles[r.code] = await prisma.role.upsert({
      where: { code: r.code },
      update: {},
      create: r,
    });
  }
  console.log('✅ System roles seeded');

  // 2. Org Units Hierarchy (University -> Campuses -> Colleges)
  const rootOrg = await prisma.orgUnit.create({
    data: {
      name: 'Badr University in Assiut (BUA)',
      unitType: 'university',
    },
  });

  const campus1Org = await prisma.orgUnit.create({
    data: {
      name: 'Main Technology Campus',
      unitType: 'campus',
      parentId: rootOrg.id,
    },
  });

  const campus2Org = await prisma.orgUnit.create({
    data: {
      name: 'Medical & Applied Science Campus',
      unitType: 'campus',
      parentId: rootOrg.id,
    },
  });

  const collegeAI = await prisma.orgUnit.create({
    data: {
      name: 'Faculty of AI & Data Management',
      unitType: 'college',
      parentId: campus1Org.id,
    },
  });

  const collegeEngineering = await prisma.orgUnit.create({
    data: {
      name: 'Faculty of Engineering & Technology',
      unitType: 'college',
      parentId: campus1Org.id,
    },
  });

  const collegeMedicine = await prisma.orgUnit.create({
    data: {
      name: 'Faculty of Allied Health Sciences',
      unitType: 'college',
      parentId: campus2Org.id,
    },
  });
  console.log('✅ Organizational Units hierarchy seeded');

  // 3. Demo Users (Argon2 / bcrypt password hashes, password: "Password123!")
  const defaultPasswordHash = await bcrypt.hash('Password123!', 12);

  const usersData = [
    { email: 'admin@bua.edu.eg', fullName: 'Dr. Karim Mansour (Super Admin)', role: 'super_admin', orgUnitId: null },
    { email: 'asset.manager@bua.edu.eg', fullName: 'Eng. Sarah Nabil (Asset Admin)', role: 'asset_admin', orgUnitId: collegeAI.id },
    { email: 'procurement@bua.edu.eg', fullName: 'Tarek Zaki (Procurement Lead)', role: 'procurement_finance', orgUnitId: null },
    { email: 'custodian.ai@bua.edu.eg', fullName: 'Dr. Mona Hegazy (AI Dept Head)', role: 'custodian_manager', orgUnitId: collegeAI.id },
    { email: 'technician@bua.edu.eg', fullName: 'Hassan Mahmoud (Senior Tech)', role: 'technician', orgUnitId: null },
    { email: 'auditor@bua.edu.eg', fullName: 'Nader Farouk (Internal Auditor)', role: 'auditor', orgUnitId: null },
  ];

  const users: Record<string, any> = {};
  for (const u of usersData) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        fullName: u.fullName,
        passwordHash: defaultPasswordHash,
        status: 'active',
      },
    });

    users[u.email] = user;

    // Grant user role
    await prisma.userRole.upsert({
      where: {
        userId_roleId_orgUnitId: {
          userId: user.id,
          roleId: roles[u.role].id,
          orgUnitId: u.orgUnitId || '',
        },
      },
      update: {},
      create: {
        userId: user.id,
        roleId: roles[u.role].id,
        orgUnitId: u.orgUnitId || null,
        grantedBy: 'system_bootstrap',
      },
    });
  }
  console.log('✅ Demo users & RBAC assignments seeded');

  // 4. Hierarchical Locations across 2 Buildings & Campuses (AST-FR-01)
  // Campus 1: Building A
  const locCampus1 = await prisma.location.create({
    data: { name: 'Assiut Main Campus Ground', code: 'LOC-CAMPUS-01', locationType: 'campus', orgUnitId: campus1Org.id },
  });

  const bldgA = await prisma.location.create({
    data: { name: 'Building A - Computing & AI Hall', code: 'LOC-BLDG-A', locationType: 'building', orgUnitId: collegeAI.id, parentId: locCampus1.id },
  });

  const bldgB = await prisma.location.create({
    data: { name: 'Building B - Advanced Engineering Labs', code: 'LOC-BLDG-B', locationType: 'building', orgUnitId: collegeEngineering.id, parentId: locCampus1.id },
  });

  // Campus 2: Building C
  const locCampus2 = await prisma.location.create({
    data: { name: 'Health Sciences Satellite Campus', code: 'LOC-CAMPUS-02', locationType: 'campus', orgUnitId: campus2Org.id },
  });

  const bldgC = await prisma.location.create({
    data: { name: 'Building C - Medical Sciences Center', code: 'LOC-BLDG-C', locationType: 'building', orgUnitId: collegeMedicine.id, parentId: locCampus2.id },
  });

  // Specific Rooms & Labs
  const roomsData = [
    { name: 'Floor 1 - High Performance AI Lab (Room 101)', code: 'LOC-A-101', type: 'room', parentId: bldgA.id, orgUnitId: collegeAI.id },
    { name: 'Floor 1 - Central Server Room & Datacenter', code: 'LOC-A-SRV', type: 'storage_area', parentId: bldgA.id, orgUnitId: collegeAI.id },
    { name: 'Floor 2 - Robotics & Embedded Systems Lab (Room 205)', code: 'LOC-A-205', type: 'room', parentId: bldgA.id, orgUnitId: collegeAI.id },
    { name: 'Floor 3 - Department Head Office (Room 301)', code: 'LOC-A-301', type: 'office', parentId: bldgA.id, orgUnitId: collegeAI.id },
    { name: 'Floor 1 - Electronics Prototyping Workshop (Room 110)', code: 'LOC-B-110', type: 'room', parentId: bldgB.id, orgUnitId: collegeEngineering.id },
    { name: 'Floor 2 - CAD & Simulation Lab (Room 220)', code: 'LOC-B-220', type: 'room', parentId: bldgB.id, orgUnitId: collegeEngineering.id },
    { name: 'Floor 1 - Biomedical Instrumentation Lab (Room 104)', code: 'LOC-C-104', type: 'room', parentId: bldgC.id, orgUnitId: collegeMedicine.id },
    { name: 'Central IT Equipment Depot & Reserve', code: 'LOC-DEPOT', type: 'storage_area', parentId: bldgA.id, orgUnitId: rootOrg.id },
  ];

  const locations: Record<string, any> = { bldgA, bldgB, bldgC };
  for (const r of roomsData) {
    const loc = await prisma.location.create({
      data: {
        name: r.name,
        code: r.code,
        locationType: r.type,
        parentId: r.parentId,
        orgUnitId: r.orgUnitId,
      },
    });
    locations[r.code] = loc;
  }
  console.log('✅ Hierarchical locations across 2 buildings seeded');

  // 5. Asset Categories
  const categoriesData = [
    { code: 'CAT-WORKSTATION', name: 'Workstation Computers & Desktops', usefulLifeMonths: 48, requiresSerial: true },
    { code: 'CAT-SERVER', name: 'Datacenter Servers & High-Performance Compute', usefulLifeMonths: 60, requiresSerial: true },
    { code: 'CAT-NETWORK', name: 'Network Infrastructure (Switches, APs, Routers)', usefulLifeMonths: 72, requiresSerial: true },
    { code: 'CAT-DISPLAY', name: 'Interactive Smart Displays & Projectors', usefulLifeMonths: 60, requiresSerial: true },
    { code: 'CAT-LAB-EQUIP', name: 'Scientific & Electronics Lab Equipment', usefulLifeMonths: 84, requiresSerial: true },
    { code: 'CAT-UPS', name: 'Uninterruptible Power Supply (UPS) Units', usefulLifeMonths: 36, requiresSerial: true },
  ];

  const categories: Record<string, any> = {};
  for (const cat of categoriesData) {
    categories[cat.code] = await prisma.assetCategory.upsert({
      where: { code: cat.code },
      update: {},
      create: cat,
    });
  }
  console.log('✅ Asset categories seeded');

  // 6. Maintenance Templates (AST-FR-05)
  const tmplServer = await prisma.maintenanceTemplate.create({
    data: {
      categoryId: categories['CAT-SERVER'].id,
      title: 'Quarterly Datacenter Server Dust Cleaning & Thermals Check',
      triggerType: 'calendar',
      intervalDays: 90,
      checklist: [
        'Inspect cooling fan operation and acoustic levels',
        'Check GPU/CPU thermal paste and core temps under synthetic load',
        'Clean air intake filters and heat sinks',
        'Verify RAID array status and battery backup unit',
      ],
    },
  });

  const tmplWorkstation = await prisma.maintenanceTemplate.create({
    data: {
      categoryId: categories['CAT-WORKSTATION'].id,
      title: 'Semi-Annual Lab PC Diagnostic & OS Integrity',
      triggerType: 'calendar',
      intervalDays: 180,
      checklist: [
        'Run memory diagnostic (MemTest)',
        'Check SSD SMART health attributes',
        'Update lab security software & BIOS firmware',
      ],
    },
  });

  const tmplUPS = await prisma.maintenanceTemplate.create({
    data: {
      categoryId: categories['CAT-UPS'].id,
      title: 'Bi-Annual UPS Battery Impedance & Load Test',
      triggerType: 'calendar',
      intervalDays: 180,
      checklist: [
        'Test battery terminal voltage and discharge curves',
        'Simulate main grid power failure under active load',
        'Inspect electrolytic capacitors for bulging or leakage',
      ],
    },
  });
  console.log('✅ Maintenance templates seeded');

  // 7. Seed 110 Varied Assets across Building A and Building B (Requirement AST-FR-02)
  console.log('📦 Seeding 110 varied assets across buildings...');
  const assetRecords: any[] = [];

  // 40 AI Lab Workstations in Building A (Room 101)
  for (let i = 1; i <= 40; i++) {
    const pad = String(i).padStart(3, '0');
    assetRecords.push({
      assetTag: `AST-PC-A101-${pad}`,
      serialNumber: `SN-HP-Z4-2024-${pad}`,
      categoryId: categories['CAT-WORKSTATION'].id,
      currentLocationId: locations['LOC-A-101'].id,
      custodianUserId: users['custodian.ai@bua.edu.eg'].id,
      brand: 'HP',
      model: 'Z4 G5 Workstation',
      specifications: { cpu: 'Intel Xeon W-2400', ram: '64GB DDR5', gpu: 'NVIDIA RTX 4000 Ada', storage: '2TB NVMe SSD' },
      condition: i % 15 === 0 ? 'fair' : 'good',
      status: 'in_service',
      purchaseDate: new Date('2024-01-15T00:00:00Z'),
      purchaseCost: 2850.00,
      riskBand: i % 10 === 0 ? 'medium' : 'low',
      riskReasons: i % 10 === 0 ? ['Scheduled inspection approaching in 14 days'] : ['Nominal operational status'],
    });
  }

  // 15 High-Performance Compute Servers in Building A Server Room
  for (let i = 1; i <= 15; i++) {
    const pad = String(i).padStart(3, '0');
    const isCritical = i === 1;
    assetRecords.push({
      assetTag: `AST-SRV-A-${pad}`,
      serialNumber: `SN-DELL-R760-${pad}`,
      categoryId: categories['CAT-SERVER'].id,
      currentLocationId: locations['LOC-A-SRV'].id,
      custodianUserId: users['custodian.ai@bua.edu.eg'].id,
      brand: 'Dell PowerEdge',
      model: 'R760xa AI Node',
      specifications: { cpu: 'Dual Intel Xeon Platinum 8480+', ram: '512GB DDR5 ECC', gpus: '4x NVIDIA H100 80GB', storage: '15TB NVMe' },
      condition: isCritical ? 'fair' : 'excellent',
      status: isCritical ? 'under_maintenance' : 'in_service',
      purchaseDate: new Date('2023-09-01T00:00:00Z'),
      purchaseCost: 45000.00,
      riskBand: isCritical ? 'critical' : 'low',
      riskReasons: isCritical
        ? ['Thermal throttling detected on GPU 3', '2 service repairs in last 90 days', 'Overdue quarterly PM']
        : ['Hardware diagnostics passed clean'],
    });
  }

  // 25 Engineering Lab CAD Workstations in Building B (Room 220)
  for (let i = 1; i <= 25; i++) {
    const pad = String(i).padStart(3, '0');
    assetRecords.push({
      assetTag: `AST-ENG-B220-${pad}`,
      serialNumber: `SN-LENOVO-P620-${pad}`,
      categoryId: categories['CAT-WORKSTATION'].id,
      currentLocationId: locations['LOC-B-220'].id,
      custodianUserId: null,
      brand: 'Lenovo',
      model: 'ThinkStation P620',
      specifications: { cpu: 'AMD Threadripper PRO 5955WX', ram: '128GB DDR4', gpu: 'NVIDIA RTX A5000', storage: '4TB NVMe' },
      condition: 'good',
      status: 'in_service',
      purchaseDate: new Date('2024-03-10T00:00:00Z'),
      purchaseCost: 3600.00,
      riskBand: 'low',
      riskReasons: ['Operational'],
    });
  }

  // 15 Lab Instruments in Building B Electronics Workshop
  for (let i = 1; i <= 15; i++) {
    const pad = String(i).padStart(3, '0');
    assetRecords.push({
      assetTag: `AST-OSC-B110-${pad}`,
      serialNumber: `SN-KEYSIGHT-DSOX-${pad}`,
      categoryId: categories['CAT-LAB-EQUIP'].id,
      currentLocationId: locations['LOC-B-110'].id,
      custodianUserId: null,
      brand: 'Keysight',
      model: 'InfiniiVision DSOX3024T 200MHz',
      specifications: { channels: 4, sampleRate: '5 GSa/s', display: '8.5-inch capacitive touch' },
      condition: 'good',
      status: 'in_service',
      purchaseDate: new Date('2023-11-20T00:00:00Z'),
      purchaseCost: 4800.00,
      riskBand: 'low',
      riskReasons: ['Calibration valid until Q4 2026'],
    });
  }

  // 10 Smart Displays & Meeting Tech across Offices
  for (let i = 1; i <= 10; i++) {
    const pad = String(i).padStart(3, '0');
    assetRecords.push({
      assetTag: `AST-DSP-ROOM-${pad}`,
      serialNumber: `SN-SAMSUNG-QB75-${pad}`,
      categoryId: categories['CAT-DISPLAY'].id,
      currentLocationId: locations['LOC-A-301'].id,
      custodianUserId: users['custodian.ai@bua.edu.eg'].id,
      brand: 'Samsung',
      model: 'QB75B 75-Inch 4K UHD Commercial Display',
      specifications: { resolution: '3840x2160', brightness: '350 nit', ports: '3x HDMI, 2x USB' },
      condition: 'good',
      status: 'in_service',
      purchaseDate: new Date('2024-02-01T00:00:00Z'),
      purchaseCost: 1450.00,
      riskBand: 'low',
      riskReasons: ['Nominal operation'],
    });
  }

  // 5 Datacenter UPS Units
  for (let i = 1; i <= 5; i++) {
    const pad = String(i).padStart(3, '0');
    assetRecords.push({
      assetTag: `AST-UPS-SRV-${pad}`,
      serialNumber: `SN-APC-SMT3000-${pad}`,
      categoryId: categories['CAT-UPS'].id,
      currentLocationId: locations['LOC-A-SRV'].id,
      custodianUserId: null,
      brand: 'APC by Schneider Electric',
      model: 'Smart-UPS RT 10kVA On-Line',
      specifications: { capacityVA: 10000, capacityWatts: 9000, topology: 'Double Conversion Online' },
      condition: i === 1 ? 'fair' : 'good',
      status: 'in_service',
      purchaseDate: new Date('2023-01-10T00:00:00Z'),
      purchaseCost: 7200.00,
      riskBand: i === 1 ? 'high' : 'low',
      riskReasons: i === 1
        ? ['Battery impedance elevated', 'Useful life approaching 36 months', 'Replacement review suggested']
        : ['Battery health 96%'],
    });
  }

  const createdAssets: any[] = [];
  for (const assetData of assetRecords) {
    const asset = await prisma.asset.create({
      data: {
        ...assetData,
        createdBy: users['asset.manager@bua.edu.eg'].id,
      },
    });
    createdAssets.push(asset);

    // Initial Registration Event (AST-FR-04)
    await prisma.assetEvent.create({
      data: {
        assetId: asset.id,
        actorUserId: users['asset.manager@bua.edu.eg'].id,
        toLocationId: asset.currentLocationId,
        toCustodianId: asset.custodianUserId,
        eventType: 'registered',
        eventData: { initialTag: asset.assetTag, brand: asset.brand, model: asset.model },
      },
    });
  }
  console.log(`✅ Seeded ${createdAssets.length} assets successfully!`);

  // 8. Work Orders (AST-FR-06)
  const criticalServer = createdAssets.find((a) => a.riskBand === 'critical') || createdAssets[40];
  const dueWorkOrder = await prisma.workOrder.create({
    data: {
      assetId: criticalServer.id,
      templateId: tmplServer.id,
      technicianUserId: users['technician@bua.edu.eg'].id,
      priority: 'critical',
      status: 'in_progress',
      scheduledDate: new Date(),
      dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days overdue
      createdBy: users['asset.manager@bua.edu.eg'].id,
    },
  });

  const completedOrder = await prisma.workOrder.create({
    data: {
      assetId: createdAssets[0].id,
      templateId: tmplWorkstation.id,
      technicianUserId: users['technician@bua.edu.eg'].id,
      priority: 'medium',
      status: 'completed',
      scheduledDate: new Date('2026-08-01T00:00:00Z'),
      dueDate: new Date('2026-08-05T00:00:00Z'),
      completedAt: new Date('2026-08-04T14:30:00Z'),
      outcome: 'repaired',
      cost: 150.00,
      downtimeHours: 3.5,
      completionNotes: 'Cleaned heatsink dust buildup and replaced faulty cooling fan. Thermal temps normalized.',
      nextDueAt: new Date('2027-02-04T14:30:00Z'),
      createdBy: users['asset.manager@bua.edu.eg'].id,
    },
  });
  console.log('✅ Active and completed work orders seeded');

  // 9. Document Evidence (AST-FR-03)
  await prisma.assetDocument.create({
    data: {
      assetId: criticalServer.id,
      documentType: 'warranty',
      title: 'Dell ProSupport Plus 5-Year Comprehensive Warranty Certificate',
      fileName: 'Warranty_Dell_PowerEdge_R760xa.pdf',
      fileSizeBytes: 245000,
      mimeType: 'application/pdf',
      privateStorageKey: 'vault_warranty_dell_r760xa.pdf',
      sha256Hex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      malwareScanStatus: 'clean',
      uploadedByUserId: users['procurement@bua.edu.eg'].id,
    },
  });

  await prisma.assetDocument.create({
    data: {
      assetId: criticalServer.id,
      documentType: 'invoice',
      title: 'Official Procurement Invoice #INV-2023-AI-902',
      fileName: 'Invoice_INV-2023-AI-902.pdf',
      fileSizeBytes: 184500,
      mimeType: 'application/pdf',
      privateStorageKey: 'vault_invoice_inv_2023_ai_902.pdf',
      sha256Hex: 'bf91672658de3da8fa737084de79427b003a290ae5c43d52c85e50529d1c92af',
      malwareScanStatus: 'clean',
      uploadedByUserId: users['procurement@bua.edu.eg'].id,
    },
  });
  console.log('✅ Procurement evidence & warranty metadata seeded');

  // 10. Audit Log Initial Entries
  await prisma.auditLog.create({
    data: {
      action: 'CREATE',
      tableName: 'assets',
      recordId: criticalServer.id,
      actorUserId: users['asset.manager@bua.edu.eg'].id,
      metadata: { action: 'initial_system_seed', assetCount: createdAssets.length },
    },
  });
  console.log('✅ Compliance audit logs seeded');

  console.log('\n🎉 Comprehensive database seeding finished successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error executing seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
