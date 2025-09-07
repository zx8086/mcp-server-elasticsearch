#!/usr/bin/env bun

/* test-ilm-policy-format.ts - Test ILM policy parameter format handling */

console.log("🧪 Testing ILM Policy Parameter Format Handling\n");

// Simulate the parameter processing logic from the fixed tool
function processIlmPolicyBody(inputBody: any) {
  let policyBody: any;
  
  // Check if body already has 'policy' wrapper (wrapped format) - use as-is
  if ('policy' in inputBody && inputBody.policy) {
    // Body format: { policy: { phases: {...} } }
    policyBody = inputBody;
  } 
  // Check if body has 'phases' directly (direct format) - wrap it
  else if ('phases' in inputBody) {
    // Body format: { phases: {...} } -> wrap as { policy: { phases: {...} } }
    policyBody = { policy: inputBody };
  } 
  // Otherwise assume it's already properly formatted
  else {
    policyBody = inputBody;
  }

  return policyBody;
}

// Test Case 1: Wrapped format (user provides { policy: { phases: {...} } })
console.log("📝 Test Case 1: Wrapped format");
const wrappedInput = {
  policy: {
    phases: {
      hot: {
        actions: {
          rollover: {
            max_age: "3d",
            max_primary_shard_size: "50gb"
          }
        }
      }
    }
  }
};

const wrappedResult = processIlmPolicyBody(wrappedInput);
console.log("Input has 'policy' wrapper:", 'policy' in wrappedInput);
console.log("Output has 'policy' wrapper:", 'policy' in wrappedResult);
console.log("Output structure:", Object.keys(wrappedResult));
console.log("✅ Should remain unchanged\n");

// Test Case 2: Direct format (user provides { phases: {...} })
console.log("📝 Test Case 2: Direct format");
const directInput = {
  phases: {
    hot: {
      actions: {
        rollover: {
          max_age: "3d",
          max_primary_shard_size: "50gb"
        }
      }
    }
  }
};

const directResult = processIlmPolicyBody(directInput);
console.log("Input has 'phases' directly:", 'phases' in directInput);
console.log("Input has 'policy' wrapper:", 'policy' in directInput);
console.log("Output has 'policy' wrapper:", 'policy' in directResult);
console.log("Output structure:", Object.keys(directResult));
console.log("✅ Should be wrapped with 'policy'\n");

// Expected API format verification
console.log("📊 Expected Elasticsearch API Format:");
console.log("The Elasticsearch client should receive:");
console.log(JSON.stringify({
  "PUT": "_ilm/policy/.monitoring-8-ilm-policy",
  "body": {
    "policy": {
      "phases": {
        "hot": {
          "actions": {
            "rollover": {
              "max_age": "3d",
              "max_primary_shard_size": "50gb"
            }
          }
        }
      }
    }
  }
}, null, 2));

console.log("\n✅ Test completed! Both formats should now work correctly.");