const assert = require("assert");

function num(v){
  return parseFloat((v || "0").toString().replace(/[$,]/g, "")) || 0;
}

function normalizeReservationCode(value){
  return (value || "").toString().trim().toUpperCase();
}

function getGrossPayoutValue(row){
  const manual =
    row && row["MANUAL TOTAL PAYOUT"] !== undefined && row["MANUAL TOTAL PAYOUT"] !== null && row["MANUAL TOTAL PAYOUT"] !== ""
      ? num(row["MANUAL TOTAL PAYOUT"])
      : null;
  if(manual !== null) return manual;
  return num(row && row["TOTAL PAYOUT"]);
}

function getCleaningValue(row){
  const hasManual = row && row["MANUAL CLEANING FARE"] !== undefined && row["MANUAL CLEANING FARE"] !== null;
  if(hasManual) return num(row["MANUAL CLEANING FARE"]);
  const isCancelled = ((row && row["STATUS"]) || "").toString().toLowerCase().includes("cancel");
  return isCancelled ? 0 : num(row && row["CLEANING FARE"]);
}

function getLengthOfStayDiscountValue(row){
  return num(row && row["LENGTH DISCOUNT"]);
}

function getWebsiteVrboFeeValue(row){
  const source = ((row && row["SOURCE"]) || "").toString().toLowerCase();
  const platform = ((row && row["PLATFORM"]) || "").toString().toLowerCase();
  const grossPayout = getGrossPayoutValue(row);

  if(source.includes("website")){
    return grossPayout * 0.01 + 0.3;
  }

  if(platform.includes("homeaway")){
    return num(row && row["CHANNEL COMMISSION"]);
  }

  return 0;
}

function getFeeCreditCardValue(row){
  const candidateKeys = [
    "MANUAL FEE CREDIT CARD",
    "FEE CREDIT CARD",
    "CREDIT CARD FEE",
    "CREDIT CARD PROCESSING FEE",
    "FEE_CREDIT_CARD",
    "feeCreditCard"
  ];

  for(const key of candidateKeys){
    if(row && row[key] !== undefined && row[key] !== null && row[key] !== ""){
      return num(row[key]);
    }
  }

  return 0;
}

function getAirbnbResolutionCenterValue(row){
  return num(row && row["AIRBNB RESOLUTION CENTER"]);
}

function getRowTaxTotal(row){
  const taxesCombined = num(row["TAXES"]);
  const detailedTaxesCombined =
    num(row["CITY TAX"]) +
    num(row["STATE TAX"]) +
    num(row["COUNTY TAX"]) +
    num(row["OCCUPANCY TAX"]) +
    num(row["GTC TAX"]);
  return Math.max(0, taxesCombined, detailedTaxesCombined);
}

function getDraftAccommodationValue(row){
  const grossPayout = getGrossPayoutValue(row);
  const draftCleaning = getCleaningValue(row);
  const taxes = getRowTaxTotal(row);
  const lengthOfStayDiscount = getLengthOfStayDiscountValue(row);
  const vrboWebsiteFee = getWebsiteVrboFeeValue(row);
  const feeCreditCard = getFeeCreditCardValue(row);
  const airbnbResolutionCenter = getAirbnbResolutionCenterValue(row);

  const draftNetAccommodation =
    grossPayout -
    draftCleaning -
    taxes +
    lengthOfStayDiscount -
    vrboWebsiteFee -
    feeCreditCard -
    airbnbResolutionCenter;

  return Math.max(0, draftNetAccommodation);
}

function round2(n){
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function run(){
  const rows = [
    {
      "CONFIRMATION CODE": "HMQ4SPTED3",
      "TOTAL PAYOUT": 1783.29,
      "CLEANING FARE": 450,
      "TAXES": 0,
      "CITY TAX": 0,
      "STATE TAX": 0,
      "COUNTY TAX": 0,
      "OCCUPANCY TAX": 0,
      "GTC TAX": 0,
      "LENGTH DISCOUNT": 0,
      "CHANNEL COMMISSION": 0,
      "PLATFORM": "airbnb",
      "SOURCE": "airbnb",
      "FEE CREDIT CARD": 0,
      "AIRBNB RESOLUTION CENTER": 0
    },
    {
      "CONFIRMATION CODE": "HA-Qph3jmf",
      "TOTAL PAYOUT": 3142.72,
      "CLEANING FARE": 500,
      "TAXES": 0,
      "CITY TAX": 42.09,
      "STATE TAX": 196.42,
      "COUNTY TAX": 42.09,
      "OCCUPANCY TAX": 56.12,
      "GTC TAX": 0,
      "LENGTH DISCOUNT": 0,
      "CHANNEL COMMISSION": 168.36,
      "PLATFORM": "homeaway",
      "SOURCE": "vrbo",
      "FEE CREDIT CARD": 0,
      "AIRBNB RESOLUTION CENTER": 0
    }
  ];

  const byCode = {};
  rows.forEach(row => {
    byCode[normalizeReservationCode(row["CONFIRMATION CODE"])] = round2(getDraftAccommodationValue(row));
  });

  assert.strictEqual(byCode["HMQ4SPTED3"], 1333.29);
  assert.strictEqual(byCode["HA-QPH3JMF"], 2137.64);

  const total = round2(byCode["HMQ4SPTED3"] + byCode["HA-QPH3JMF"]);
  assert.strictEqual(total, 3470.93);
  assert.notStrictEqual(total, 3807.65);

  console.log("PASS net-accommodation regression");
  console.log(JSON.stringify({
    HMQ4SPTED3: byCode["HMQ4SPTED3"],
    "HA-QPH3JMF": byCode["HA-QPH3JMF"],
    total
  }, null, 2));
}

run();
