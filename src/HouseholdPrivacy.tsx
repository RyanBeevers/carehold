export function HouseholdPrivacy(){
 return <section className="setting-section" aria-label="Household privacy and security">
  <div>
   <h2>Household privacy</h2>
   <p>Carehold is currently for your invited household. Private writing stays separate from caregiver permissions, and shared writing goes only to the people you choose.</p>
  </div>
  <details className="household-security-details">
   <summary>How encryption and device safety work</summary>
   <p>Carehold encrypts private writing before it reaches the server and checks recipient keys automatically when you share. There are no codes to compare for routine conversations. Only an unexpected change pauses sending so you can confirm it with the person.</p>
   <p>Today, a one-time encrypted-writing backup code still needs to be saved outside Carehold. Passkey sign-in by itself cannot restore encryption on a different device. We're working toward secure trusted-device or passkey-assisted recovery, with backup codes as a fallback, but that isn't implemented yet.</p>
   <p>Previously authorized devices may retain copies they already received. Independent device-by-device cryptographic revocation is not available yet.</p>
   <p>Carehold is a household pilot, not a clinically reviewed or independently audited confidential messaging service. More stringent security and minor-privacy verification is needed before public or professional use.</p>
  </details>
 </section>;
}
