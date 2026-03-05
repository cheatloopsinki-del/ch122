
const { createClient } = require('@supabase/supabase-client');
const fetch = require('node-fetch');

// Hardcoded for direct execution
const SUPABASE_URL = 'https://pbdkxzrzbnlajjgubgis.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBiZGt4enJ6Ym5sYWpqZ3ViZ2lzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTIwMzEwOCwiZXhwIjoyMDc2Nzc5MTA4fQ.1fEeddMQjNTCpX-oz-gccc4PDdhk7Ly-hw6bHZN-ugI'; 
const MONEYMOTION_API_KEY = 'mk_live_k8bIPj6uUTkrl6DdL34rvYOj0IZf6j8D';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkPendingIntents() {
  console.log("--- Checking All Pending Intents Against MoneyMotion ---");
  
  // Get pending intents from last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const { data: intents, error } = await supabase
    .from('purchase_intents')
    .select('*')
    .eq('status', 'pending')
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error fetching intents:", error);
    return;
  }

  console.log(`Found ${intents.length} pending intents in last 7 days.`);

  for (const intent of intents) {
    process.stdout.write(`Checking intent ${intent.id} (${intent.email})... `);
    
    // Try to find checkout session by intent_id in metadata
    // Using the encoded input method that seemed most promising
    const input = JSON.stringify({ metadata: { intent_id: intent.id } });
    const encodedInput = Buffer.from(input).toString('base64');
    const url = `https://api.moneymotion.net/checkoutSessions.listCheckoutSessions?input=${encodedInput}`;

    try {
      const response = await fetch(url, {
        headers: { 'x-api-key': MONEYMOTION_API_KEY }
      });

      if (response.ok) {
        const data = await response.json();
        const sessions = data.data || [];
        const completedSession = sessions.find(s => s.status === 'completed' || s.paymentStatus === 'paid');
        
        if (completedSession) {
          console.log(`\n✅ FOUND COMPLETED SESSION: ${completedSession.id}`);
          console.log(`   Processing order for ${intent.email}...`);
          // Here we would call the force process logic
        } else {
          console.log("No completed session found.");
        }
      } else {
        console.log(`API Error: ${response.status}`);
      }
    } catch (err) {
      console.log(`Error: ${err.message}`);
    }
  }
}

checkPendingIntents();
