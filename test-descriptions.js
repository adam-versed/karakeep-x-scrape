#!/usr/bin/env node

// Quick test to check if enhanced descriptions are in the database
import { db } from '@karakeep/db';
import { bookmarkLinks } from '@karakeep/db/schema';
import { eq } from 'drizzle-orm';

async function testDescriptions() {
  console.log('🔍 Testing description enhancements...\n');
  
  // Test the specific bookmark from your logs
  const testBookmarkId = 'voezrlihw4wlfbg9ojcyrb7i';
  
  try {
    const bookmark = await db.query.bookmarkLinks.findFirst({
      where: eq(bookmarkLinks.id, testBookmarkId),
      columns: {
        id: true,
        url: true,
        title: true,
        description: true,
      }
    });
    
    if (bookmark) {
      console.log('✅ Found bookmark in database:');
      console.log(`ID: ${bookmark.id}`);
      console.log(`URL: ${bookmark.url}`);
      console.log(`Title: ${bookmark.title}`);
      console.log(`Description: ${bookmark.description}`);
      console.log('');
      
      // Check if it has the enhanced description
      const expectedDesc = "Revolutionize Figma design with MagicPath!";
      if (bookmark.description && bookmark.description.includes(expectedDesc)) {
        console.log('🎉 ENHANCEMENT CONFIRMED: Database has the LLM-generated description!');
      } else {
        console.log('❌ ENHANCEMENT MISSING: Database still has old description');
        console.log('Expected to contain:', expectedDesc);
      }
    } else {
      console.log('❌ Bookmark not found in database');
    }
    
    // Check a few more recent bookmarks
    console.log('\n🔍 Checking other recent bookmarks...');
    const recentBookmarks = await db.query.bookmarkLinks.findMany({
      columns: {
        id: true,
        url: true,
        description: true,
      },
      limit: 5,
      orderBy: (bookmarkLinks, { desc }) => [desc(bookmarkLinks.crawledAt)]
    });
    
    console.log(`Found ${recentBookmarks.length} recent bookmarks:`);
    recentBookmarks.forEach((bm, i) => {
      console.log(`${i + 1}. ${bm.url}`);
      console.log(`   Description: ${bm.description || '(no description)'}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Database error:', error);
  }
  
  process.exit(0);
}

testDescriptions();