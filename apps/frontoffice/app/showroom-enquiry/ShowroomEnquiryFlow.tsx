"use client";

import Image from "next/image";
import { useState } from "react";
import { submitPublicShowroomEnquiry } from "../vehicles/service";
import { showroomBrands, showroomBudgetRanges, showroomStepError } from "./showroom-enquiry";

const vehicleTiles = [
  { type: "Sedan", image: "/showroom-enquiry/canvas-sedan.png" },
  { type: "SUV", image: "/showroom-enquiry/canvas-suv.png" },
  { type: "MPV", image: "/showroom-enquiry/canvas-mpv.png" },
  { type: "Pickup", image: "/showroom-enquiry/canvas-pickup.png" }
] as const;

export function ShowroomEnquiryFlow() {
  const [step, setStep] = useState(1);
  const [vehicleType, setVehicleType] = useState("");
  const [preferredBrand, setPreferredBrand] = useState("");
  const [preferredModel, setPreferredModel] = useState("");
  const [budgetRange, setBudgetRange] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const values = { vehicleType, budgetRange, customerName, phone, consent };
  const isDirectionOne = !submitted && step === 1;
  const progressItems = isDirectionOne ? [1, 2, 3, 4, 5] : [1, 2, 3];
  const continueTo = (nextStep: number) => {
    const stepError = showroomStepError(step, values);
    if (stepError) {
      setError(stepError);
      return;
    }
    setError("");
    setStep(nextStep);
  };

  const submit = async () => {
    const stepError = showroomStepError(3, values);
    if (stepError) {
      setError(stepError);
      return;
    }

    setSubmitting(true);
    setError("");
    const result = await submitPublicShowroomEnquiry({ vehicleType, preferredBrand, preferredModel, budgetRange, customerName, phone, email });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSubmitted(true);
  };

  return (
    <main className="showroomEnquiryPage">
      <div className={`showroomEnquiryShell${isDirectionOne ? " showroomDirectionOne" : ""}`}>
        <header className="showroomEnquiryHeader">
          <Image src="/ys-heng-logo.png" alt="YS Heng Auto" width={125} height={56} priority />
          <p>Showroom enquiry</p>
        </header>

        {!submitted && step === 1 && <div className="showroomHeroImage">
          <Image src="/showroom-enquiry/canvas-hero.png" alt="Vehicles waiting in the YS Heng showroom" fill priority sizes="(max-width: 640px) 100vw, 680px" />
        </div>}

        {submitted ? (
          <section className="showroomSuccess" aria-labelledby="showroom-success-title">
            <p className="showroomEyebrow">Enquiry received</p>
            <h1 id="showroom-success-title">Thank you, {customerName.trim()}.</h1>
            <p>Our Sales team has received your showroom preferences and will follow up using the phone number you provided.</p>
          </section>
        ) : (
          <>
            <ol className="showroomProgress" aria-label={`Step ${step} of 3`}>
              {progressItems.map((itemStep) => {
                const label = ["Your car", "Preferences", "Your details"][itemStep - 1];
                return <li className={itemStep === step ? "isCurrent" : itemStep < step ? "isComplete" : ""} key={itemStep}><span>{isDirectionOne ? "" : itemStep}</span>{label}</li>;
              })}
            </ol>

            {step === 1 && <section className="showroomStep" aria-labelledby="showroom-type-title">
              <p className="showroomEyebrow">Showroom enquiry</p>
              <h1 id="showroom-type-title">What are you looking for?</h1>
              <p className="showroomIntro">Choose one to help us shortlist.</p>
              <div className="showroomVehicleTiles">
                {vehicleTiles.map((tile) => <button type="button" className={vehicleType === tile.type ? "isSelected" : ""} aria-label={tile.type} aria-pressed={vehicleType === tile.type} onClick={() => setVehicleType(tile.type)} key={tile.type}>
                  <img src={tile.image} alt="" />
                  <strong>{tile.type}</strong>
                </button>)}
              </div>
              <button type="button" className="showroomPrimaryAction" onClick={() => continueTo(2)}>Next</button>
            </section>}

            {step === 2 && <section className="showroomStep" aria-labelledby="showroom-preferences-title">
              <p className="showroomEyebrow">Your preferences</p>
              <h1 id="showroom-preferences-title">Help us narrow it down.</h1>
              <p className="showroomIntro">A brand or model is helpful, but you can leave either open.</p>
              <fieldset className="showroomChoiceGroup">
                <legend>Preferred brand</legend>
                <div className="showroomPills">{showroomBrands.map((brand) => <button type="button" className={preferredBrand === brand ? "isSelected" : ""} aria-pressed={preferredBrand === brand} onClick={() => setPreferredBrand(preferredBrand === brand ? "" : brand)} key={brand}>{brand}</button>)}</div>
              </fieldset>
              <label className="showroomField">Preferred model <span>(optional)</span><input value={preferredModel} maxLength={100} onChange={(event) => setPreferredModel(event.target.value)} placeholder="e.g. Vios, City, Alza" /></label>
              <fieldset className="showroomChoiceGroup">
                <legend>Your budget</legend>
                <div className="showroomBudgetTiles">{showroomBudgetRanges.map((range) => <button type="button" className={budgetRange === range ? "isSelected" : ""} aria-pressed={budgetRange === range} onClick={() => setBudgetRange(range)} key={range}>{range}</button>)}</div>
              </fieldset>
              <div className="showroomActionRow"><button type="button" className="showroomSecondaryAction" onClick={() => setStep(1)}>Back</button><button type="button" className="showroomPrimaryAction" onClick={() => continueTo(3)}>Continue</button></div>
            </section>}

            {step === 3 && <section className="showroomStep" aria-labelledby="showroom-details-title">
              <p className="showroomEyebrow">Almost there</p>
              <h1 id="showroom-details-title">How can Sales reach you?</h1>
              <p className="showroomIntro">We will use these details only to follow up on this showroom enquiry.</p>
              <label className="showroomField">Name<input autoComplete="name" value={customerName} maxLength={120} onChange={(event) => setCustomerName(event.target.value)} /></label>
              <label className="showroomField">Phone <span>required</span><input type="tel" autoComplete="tel" value={phone} maxLength={64} onChange={(event) => setPhone(event.target.value)} placeholder="012-3456789" /></label>
              <label className="showroomField">Email <span>(optional)</span><input type="email" autoComplete="email" value={email} maxLength={320} onChange={(event) => setEmail(event.target.value)} /></label>
              <label className="showroomConsent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> <span>I agree that YS Heng Automotive may use my details to follow up on this showroom enquiry.</span></label>
              <div className="showroomActionRow"><button type="button" className="showroomSecondaryAction" onClick={() => setStep(2)}>Back</button><button type="button" className="showroomPrimaryAction" disabled={submitting} onClick={() => void submit()}>{submitting ? "Sending..." : "Send enquiry"}</button></div>
            </section>}

            {error && <p className="showroomFormError" role="alert">{error}</p>}
          </>
        )}
      </div>
    </main>
  );
}
