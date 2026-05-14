/**
 * Example 04: Carbon Credit Audit
 * 
 * Demonstrates carbon credit validation workflow in the sandbox
 * 
 * Run: node examples/sandbox/04-carbon-audit.mjs
 */

const API_URL = process.env.VERA_API_URL || 'http://localhost:8080';

console.log('🧪 Vera Sandbox - Carbon Credit Audit Example\n');

// Sample carbon credit projects (matching WV examples from validator)
const SAMPLE_PROJECTS = [
  {
    id: 'VCS-VCU-1523',
    type: 'FORESTRY',
    location: 'WV',
    vintage: 2023,
    tons: 50000,
    projectName: 'West Virginia Forest Conservation'
  },
  {
    id: 'VCS-VCU-1524',
    type: 'RENEWABLE_ENERGY',
    location: 'WV',
    vintage: 2023,
    tons: 75000,
    projectName: 'Appalachian Solar Farm'
  },
  {
    id: 'ACR-CR-7892',
    type: 'DIRECT_AIR_CAPTURE',
    location: 'WV',
    vintage: 2024,
    tons: 15000,
    projectName: 'WV Carbon Capture Pilot'
  }
];

async function carbonAuditExample() {
  try {
    // 1. Check carbon validator status
    console.log('1️⃣  Checking carbon validator...');
    const statusResponse = await fetch(`${API_URL}/api/v1/carbon/status`);
    
    if (!statusResponse.ok) {
      console.log('   ⚠️  Carbon validator endpoint not available');
      console.log('   Running simulated carbon audit...\n');
      await simulatedCarbonAudit();
      return;
    }

    const status = await statusResponse.json();
    console.log('   ✅ Carbon validator status:');
    console.log(`   Active: ${status.active}`);
    console.log(`   Projects Tracked: ${status.projectsTracked || 0}`);
    console.log(`   Total Tons Verified: ${status.totalTons || 0}\n`);

    // 2. List carbon projects
    console.log('2️⃣  Listing carbon projects...');
    const projectsResponse = await fetch(`${API_URL}/api/v1/carbon/projects`);
    const projects = await projectsResponse.json();
    
    console.log(`   ✅ Found ${projects.length} project(s):`);
    projects.forEach(p => {
      console.log(`   - ${p.id}: ${p.tons.toLocaleString()} tons | ${p.type} | ${p.location}`);
    });
    console.log();

    // 3. Submit new project for validation
    console.log('3️⃣  Submitting new project for validation...');
    const newProject = SAMPLE_PROJECTS[2]; // DAC project
    
    const submitResponse = await fetch(`${API_URL}/api/v1/carbon/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newProject)
    });

    if (!submitResponse.ok) {
      throw new Error(`Validation failed: ${submitResponse.status}`);
    }

    const validation = await submitResponse.json();
    console.log('   ✅ Project submitted for validation');
    console.log(`   Validation ID: ${validation.id}`);
    console.log(`   Status: ${validation.status}`);
    console.log(`   Quality Score: ${validation.qualityScore || 'pending'}\n`);

    // 4. Check validation result
    console.log('4️⃣  Checking validation result...');
    await new Promise(r => setTimeout(r, 2000)); // Wait for processing
    
    const resultResponse = await fetch(`${API_URL}/api/v1/carbon/validation/${validation.id}`);
    const result = await resultResponse.json();
    
    console.log('   ✅ Validation complete!');
    console.log(`   Result: ${result.status}`);
    console.log(`   Verified Tons: ${result.verifiedTons?.toLocaleString() || 'pending'}`);
    console.log(`   Quality Tier: ${result.qualityTier || 'pending'}`);
    
    if (result.issues?.length > 0) {
      console.log(`   Issues Found: ${result.issues.length}`);
      result.issues.forEach(issue => console.log(`   ⚠️  ${issue}`));
    }
    console.log();

    // 5. Generate carbon report
    console.log('5️⃣  Generating carbon report...');
    const reportResponse = await fetch(`${API_URL}/api/v1/carbon/report`);
    const report = await reportResponse.json();
    
    console.log('   ✅ Carbon Report Generated');
    console.log(`   Total Verified: ${report.totalVerified?.toLocaleString()} tons`);
    console.log(`   Total Retired: ${report.totalRetired?.toLocaleString()} tons`);
    console.log(`   Net Available: ${report.netAvailable?.toLocaleString()} tons`);
    console.log(`   Verification Rate: ${report.verificationRate}%`);
    console.log();

    // 6. Project breakdown
    console.log('6️⃣  Project Breakdown by Type:');
    const breakdown = report.breakdownByType || {};
    Object.entries(breakdown).forEach(([type, data]) => {
      console.log(`   ${type}: ${data.tons?.toLocaleString()} tons (${data.count} projects)`);
    });
    console.log();

    console.log('🎉 Carbon Audit Example Complete!');
    console.log('\nWhat you learned:');
    console.log('  ✅ Querying carbon projects');
    console.log('  ✅ Submitting projects for validation');
    console.log('  ✅ Interpreting validation results');
    console.log('  ✅ Generating carbon reports');
    console.log('  ✅ Analyzing project breakdowns');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\nRunning simulated carbon audit...\n');
    await simulatedCarbonAudit();
  }
}

async function simulatedCarbonAudit() {
  // Simulate carbon audit without real API
  console.log('📊 SIMULATED Carbon Audit\n');

  // 1. Show sample projects
  console.log('1️⃣  Sample WV Carbon Projects:');
  SAMPLE_PROJECTS.forEach((p, i) => {
    console.log(`   [${i + 1}] ${p.id}`);
    console.log(`       Project: ${p.projectName}`);
    console.log(`       Type: ${p.type} | Location: ${p.location}`);
    console.log(`       Vintage: ${p.vintage} | Tons: ${p.tons.toLocaleString()}`);
    console.log();
  });

  // 2. Validation simulation
  console.log('2️⃣  Running Validation Checks...');
  await new Promise(r => setTimeout(r, 500));
  
  SAMPLE_PROJECTS.forEach(p => {
    const checks = [
      { name: 'Registry Verification', passed: true },
      { name: 'Double-Counting Check', passed: true },
      { name: 'Vintage Validity', passed: p.vintage >= 2020 },
      { name: 'Location Verification', passed: p.location === 'WV' }
    ];
    
    const score = checks.filter(c => c.passed).length / checks.length;
    const tier = score === 1 ? 'PLATINUM' : score >= 0.75 ? 'GOLD' : score >= 0.5 ? 'SILVER' : 'BRONZE';
    
    console.log(`   ✅ ${p.id}: ${tier} (${(score * 100).toFixed(0)}% score)`);
  });
  console.log();

  // 3. Summary
  const totalTons = SAMPLE_PROJECTS.reduce((sum, p) => sum + p.tons, 0);
  console.log('3️⃣  Carbon Report Summary:');
  console.log(`   Total Projects: ${SAMPLE_PROJECTS.length}`);
  console.log(`   Total Tons: ${totalTons.toLocaleString()}`);
  console.log(`   Average per Project: ${Math.round(totalTons / SAMPLE_PROJECTS.length).toLocaleString()}`);
  console.log(`   WV Projects: ${SAMPLE_PROJECTS.filter(p => p.location === 'WV').length}`);
  console.log();

  console.log('🎉 Simulated Carbon Audit Complete!');
  console.log('\nNote: For real carbon validation, ensure:');
  console.log('  1. Carbon validator agent is running');
  console.log('  2. HCS topics are configured');
  console.log('  3. Registry APIs are accessible');
}

carbonAuditExample();
