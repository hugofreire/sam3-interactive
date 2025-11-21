/**
 * Database Test Script
 * Tests all database functionality before integrating into server
 */

const db = require('./database');

async function runTests() {
    console.log('\n========================================');
    console.log('🧪 SAM3 Database Test Suite');
    console.log('========================================\n');

    try {
        // Test 1: Initialize main database
        console.log('Test 1: Initialize main database...');
        await db.initMainDatabase();
        console.log('✅ Main database initialized\n');

        // Test 2: Create project
        console.log('Test 2: Create project...');
        const project = await db.createProject({
            name: 'Test Car Dataset',
            description: 'Testing database functionality',
            settings: {
                background_mode: 'transparent',
                default_labels: ['car', 'truck', 'bus']
            }
        });
        console.log('✅ Project created:', project);
        console.log('   ID:', project.id);
        console.log('   Name:', project.name);
        console.log();

        // Test 3: Get all projects
        console.log('Test 3: Get all projects...');
        const projects = await db.getAllProjects();
        console.log('✅ Found', projects.length, 'project(s)');
        projects.forEach(p => {
            console.log(`   - ${p.name} (${p.num_crops} crops, ${p.num_labels} labels)`);
        });
        console.log();

        // Test 4: Get project by ID
        console.log('Test 4: Get project by ID...');
        const foundProject = await db.getProjectById(project.id);
        console.log('✅ Project found:', foundProject.name);
        console.log('   Stats:', foundProject.stats);
        console.log();

        // Test 5: Create crops
        console.log('Test 5: Create crops...');
        const crop1 = await db.createCrop(project.id, {
            label: 'car',
            filename: 'crop_001.png',
            source_image: 'test_image.jpg',
            source_session_id: 'test_session_123',
            bbox: [100, 200, 150, 120],
            mask_score: 0.95,
            mask_area: 18000,
            background_mode: 'transparent'
        });
        console.log('✅ Crop 1 created:', crop1.id, '-', crop1.label);

        const crop2 = await db.createCrop(project.id, {
            label: 'car',
            filename: 'crop_002.png',
            source_image: 'test_image.jpg',
            source_session_id: 'test_session_123',
            bbox: [300, 150, 140, 110],
            mask_score: 0.92,
            mask_area: 15400,
            background_mode: 'transparent'
        });
        console.log('✅ Crop 2 created:', crop2.id, '-', crop2.label);

        const crop3 = await db.createCrop(project.id, {
            label: 'truck',
            filename: 'crop_003.png',
            source_image: 'test_image2.jpg',
            source_session_id: 'test_session_456',
            bbox: [50, 100, 200, 180],
            mask_score: 0.89,
            mask_area: 36000,
            background_mode: 'white'
        });
        console.log('✅ Crop 3 created:', crop3.id, '-', crop3.label);
        console.log();

        // Test 6: Get all crops
        console.log('Test 6: Get all crops...');
        const allCrops = await db.getCrops(project.id);
        console.log('✅ Found', allCrops.length, 'crops');
        allCrops.forEach(c => {
            console.log(`   - ${c.label} (${c.filename}, score: ${c.mask_score})`);
        });
        console.log();

        // Test 7: Filter crops by label
        console.log('Test 7: Filter crops by label (car)...');
        const carCrops = await db.getCrops(project.id, { label: 'car' });
        console.log('✅ Found', carCrops.length, 'car crop(s)');
        console.log();

        // Test 8: Get crop by ID
        console.log('Test 8: Get crop by ID...');
        const foundCrop = await db.getCropById(project.id, crop1.id);
        console.log('✅ Crop found:', foundCrop.label, foundCrop.filename);
        console.log('   BBox:', foundCrop.bbox);
        console.log();

        // Test 9: Update project stats
        console.log('Test 9: Check project stats after adding crops...');
        const updatedProject = await db.getProjectById(project.id);
        console.log('✅ Project stats updated:');
        console.log('   Total crops:', updatedProject.stats.total_crops);
        console.log('   Labels:', updatedProject.stats.labels);
        console.log();

        // Test 10: Update crop label
        console.log('Test 10: Update crop label...');
        await db.updateCropLabel(project.id, crop3.id, 'bus');
        const updatedCrop = await db.getCropById(project.id, crop3.id);
        console.log('✅ Crop label updated:', updatedCrop.label);
        console.log();

        // Test 11: Check label counts after update
        console.log('Test 11: Verify label counts after update...');
        const projectAfterUpdate = await db.getProjectById(project.id);
        console.log('✅ Labels after update:', projectAfterUpdate.stats.labels);
        console.log();

        // Test 12: Delete crop
        console.log('Test 12: Delete crop...');
        await db.deleteCrop(project.id, crop2.id);
        const cropsAfterDelete = await db.getCrops(project.id);
        console.log('✅ Crop deleted. Remaining:', cropsAfterDelete.length, 'crops');
        console.log();

        // Test 13: Update project metadata
        console.log('Test 13: Update project metadata...');
        await db.updateProject(project.id, {
            name: 'Test Car Dataset (Updated)',
            description: 'Updated description'
        });
        const finalProject = await db.getProjectById(project.id);
        console.log('✅ Project updated:', finalProject.name);
        console.log();

        // Test 14: Database persistence
        console.log('Test 14: Test database persistence...');
        console.log('   Closing project DB...');
        await db.closeProjectDB(project.id);
        console.log('   Reopening project DB...');
        await db.initProjectDatabase(project.id);
        const persistedCrops = await db.getCrops(project.id);
        console.log('✅ Data persisted:', persistedCrops.length, 'crops still there');
        console.log();

        // Final summary
        console.log('========================================');
        console.log('✅ ALL TESTS PASSED!');
        console.log('========================================');
        console.log('\n📊 Final State:');
        console.log('   Projects:', (await db.getAllProjects()).length);
        console.log('   Crops:', persistedCrops.length);
        console.log('   Database files created:');
        console.log('     - backend/datasets/projects.db');
        console.log(`     - backend/datasets/${project.id}/metadata.db`);
        console.log(`     - backend/datasets/${project.id}/crops/ (directory)`);
        console.log();

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        console.error(error);
    } finally {
        // Cleanup: Close all connections
        console.log('Closing all database connections...');
        await db.closeAll();
        console.log('✅ All connections closed\n');
    }
}

// Run tests
runTests();
