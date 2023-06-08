// Imports
const axios = require('axios');

// Load contents of .env into process.env
require('dotenv').config();

// Populate config object from .env file
let config = {
  discoveryUrl: process.env.DISCOVERY_URL,
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  scope: process.env.SCOPE
};

// Call main function
main();

// All code wrapped in main function to allow use of async/await
async function main() {

  // Create options for call to OAuth discovery endpoint
  let options = {
    method: "GET",
    url: config.discoveryUrl,
    headers: {
      'accept': 'application/json'
    }
  };

  // Make call to discovery endpoint
  console.log("** Calling discovery URL:", JSON.stringify(options));
  let response = await axios(options);
  console.log("** Metadata: " + JSON.stringify(response.data));

  // Add discovery metadata to config object
  config.metadata = response.data;

  // Create options for call to OAuth Device Authorization endpoint
  options = {
    method: "POST",
    url: config.metadata.device_authorization_endpoint,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    data: {
      client_id: config.clientId,
      scope: config.scope,
    }
  };

  // Make call to Device Authorization endpoint
  console.log("\n** Calling device authorization endpoint:", JSON.stringify(options));
  response = await axios(options);
  console.log("** Response: " + JSON.stringify(response.data));
  
  // Print code and verification URL to console
  console.log("\n===========================================");
  console.log("User code: " + response.data.user_code);
  console.log("\nPlease visit this URL:");
  console.log(response.data.verification_uri_complete);
  console.log("============================================\n");

  // Initiate background polling for token (using device_code) and wait...
  let token_response = await poll_for_token(response.data.device_code, response.data.interval);

  // We now have tokens

  // Create options for call to UserInfo endpoint
  options = {
    method: "GET",
    url: config.metadata.userinfo_endpoint,
    headers: {
      'authorization': 'Bearer ' + token_response.access_token,
      'accept': 'application/json'
    }
  };

  // Make call to UserInfo endpoint
  console.log("\n** Calling userInfo: " + JSON.stringify(options));
  response = await axios(options);
  console.log("** Response data: " + JSON.stringify(response.data));

  // Output name and nickname to console
  let userInfo = response.data;
  console.log("\n===========================================");
  console.log(`Welcome ${userInfo.name}!`);
  console.log(`\nNickname: ${userInfo.nickname}`);
  console.log("============================================\n");
  return true;
}

// Utility function to wait for a number of seconds
function delay(time_in_seconds) {
  return new Promise(resolve => setTimeout(resolve, time_in_seconds * 1000));
}

// Function to perform background polling to token endpoint
// Inputs:
//  device code received during flow initialization
//  interval to wait between polls (also received in initialization response)
async function poll_for_token(device_code, interval) {

  // Create options for call to token endpoint
  let options = {
    method: "POST",
    url: config.metadata.token_endpoint,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    data: {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: config.clientId,
      device_code: device_code
    }
  };

  // If this is a confidential client (with a secret), add this to data
  if (config.clientSecret) {
    options.data.client_secret = config.clientSecret;
  };


  console.log("\n** Polling token endpoint:", JSON.stringify(options));

  // Set response to null
  let response = null;

  // Loop while response remains null
  while (!response) {

    // Wait for interval specified by server (or 5 seconds)
    await delay(interval ? interval : 5);

    // Attenpt call to token endpoint but catch errors
    try {
      response = await axios(options);
    } catch(e) { process.stdout.write(e?.response?.data?.error + "...") } // ignore error
  
    // If call successful, response will hold the response - loop ends
    // If call unsuccessful, response will still be null - loop repeats
  }

  // We have a successful response
  console.log("Done.");
  console.log("** Response: " + JSON.stringify(response.data));

  // Get token response from response data
  let token_response = response.data;
 
  // Add absolute access token expiry time to token response
  token_response.expiry = new Date().getTime() + (token_response.expires_in * 1000);

  // Return token response back to caller
  return token_response;
}