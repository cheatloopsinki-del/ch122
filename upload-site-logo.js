import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Credentials (read from environment)
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function uploadLogo() {
  console.log('🚀 Starting logo upload...');

  const logoPath = path.join(__dirname, 'public', 'cheatloop.jpg');
  
  if (!fs.existsSync(logoPath)) {
    console.error('❌ Logo file not found at:', logoPath);
    return;
  }

  const fileBuffer = fs.readFileSync(logoPath);
  // Use a unique filename to bypass Discord cache
  const timestamp = Date.now();
  const fileName = `discord-bot-logo-${timestamp}.jpg`;
  const filePath = `discord-avatars/${fileName}`;

  // 1. Upload to Storage
  console.log('Uploading to Supabase Storage...');
  const { data, error } = await supabase.storage
    .from('product-images') // We know this bucket is public
    .upload(filePath, fileBuffer, {
      contentType: 'image/jpeg',
      upsert: true
    });

  if (error) {
    console.error('❌ Upload failed:', error.message);
    return;
  }

  // 2. Get Public URL
  const { data: { publicUrl } } = supabase.storage
    .from('product-images')
    .getPublicUrl(filePath);

  console.log('✅ Upload successful!');
  console.log('Public URL:', publicUrl);

  // 3. Update Site Settings
  console.log('Updating site_settings...');
  const { error: dbError } = await supabase
    .from('site_settings')
    .upsert({ 
      key: 'discord_bot_avatar_url', 
      value: publicUrl 
    }, { onConflict: 'key' });

  if (dbError) {
    console.error('❌ Database update failed:', dbError.message);
  } else {
    console.log('✅ Database setting updated successfully!');
  }

  return publicUrl;
}

uploadLogo();
