export function HouseholdPrivacy(){
 return <section className="setting-section" aria-label="Household privacy and security">
  <div>
   <h2>Household privacy</h2>
   <p>Carehold is currently for your invited household. Private writing stays separate from caregiver permissions, and shared writing goes only to the people you choose.</p>
  </div>
  <details className="household-security-details">
   <summary>How encryption and device safety work</summary>
   <p>Carehold encrypts journal and message text before it reaches the server. This browser remembers recipient encryption codes when you send; if a code changes, sending pauses until you compare it with the person and explicitly accept it.</p>
   <p>Save your CH1 encryption recovery code outside Carehold. Passkeys are for sign-in, not decryption recovery. A previously authorized device may retain old encrypted copies, and device-by-device cryptographic revocation is not available yet.</p>
   <p>Carehold is a household pilot, not a clinically reviewed or independently audited confidential messaging service. More stringent security and minor-privacy verification is needed before public or professional use.</p>
  </details>
 </section>;
}
