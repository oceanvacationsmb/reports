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
  const source = ((row && row["SOURCE"]) || "").toString().trim().toLowerCase();
  const platform = ((row && row["PLATFORM"]) || "").toString().trim().toLowerCase();
  const grossPayout = getGrossPayoutValue(row);
  const preCancellationHostPayout = num(row && row["PRE CANCELLATION HOST PAYOUT"]);

  if(source === "manual" || platform === "manual"){
    const manualFeeBase = preCancellationHostPayout > 0 ? preCancellationHostPayout : grossPayout;
    return manualFeeBase * 0.01 + 0.3;
  }

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
  const detailedKeys = [
    "CITY TAX", "STATE TAX", "COUNTY TAX", "OCCUPANCY TAX", "GTC TAX",
    "CITY TAXES", "STATE TAXES", "COUNTY TAXES", "OCCUPANCY TAXES", "GTC TAXES",
    "ACCOMMODATION TAX", "TOURISM TAX", "LODGING TAX"
  ];
  const taxesCombined = num(row["TAXES"]);
  const detailedTaxesCombined = detailedKeys.reduce((sum, key) => sum + num(row[key]), 0);
  const items = Array.isArray(row["INVOICE ITEMS RAW"]) ? row["INVOICE ITEMS RAW"] : [];
  const invoiceItemsTaxCombined = items.reduce((sum, item) => {
    const label = [item.title || "", item.name || "", item.description || "", item.type || ""].join(" ").toLowerCase();
    const type = (item.type || "").toLowerCase();
    const isTaxLike =
      type.includes("tax") ||
      label.includes(" tax") ||
      label.includes("tax ") ||
      label.includes("occupancy") ||
      label.includes("tourism") ||
      label.includes("lodging") ||
      label.includes("accommodation tax");
    if(!isTaxLike) return sum;
    return sum + Math.max(0, num(item.value));
  }, 0);
  return Math.max(0, taxesCombined, detailedTaxesCombined, invoiceItemsTaxCombined);
}

function getDraftAccommodationValue(row){
  const source = ((row && row["SOURCE"]) || "").toString().trim().toLowerCase();
  const platform = ((row && row["PLATFORM"]) || "").toString().trim().toLowerCase();
  const manualAcc =
    row && row["MANUAL ACCOMMODATION"] !== undefined && row["MANUAL ACCOMMODATION"] !== null && row["MANUAL ACCOMMODATION"] !== ""
      ? num(row["MANUAL ACCOMMODATION"])
      : null;

  if(manualAcc !== null){
    if(source === "manual" || platform === "manual"){
      return Math.max(0, manualAcc - getWebsiteVrboFeeValue(row));
    }
    return manualAcc;
  }

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

  const altTaxShape = {
    "TAXES": 0,
    "CITY TAXES": 42.09,
    "STATE TAXES": 196.42,
    "COUNTY TAXES": 42.09,
    "LODGING TAX": 56.12
  };
  assert.strictEqual(round2(getRowTaxTotal(altTaxShape)), 336.72);

  const invoiceOnlyTaxShape = {
    "TAXES": 0,
    "CITY TAX": 0,
    "STATE TAX": 0,
    "COUNTY TAX": 0,
    "OCCUPANCY TAX": 0,
    "GTC TAX": 0,
    "INVOICE ITEMS RAW": [
      { title: "State Tax", type: "tax", value: 196.42 },
      { title: "County Tax", type: "tax", value: 42.09 },
      { title: "City Tax", type: "tax", value: 42.09 },
      { title: "Occupancy", type: "tax", value: 56.12 }
    ]
  };
  assert.strictEqual(round2(getRowTaxTotal(invoiceOnlyTaxShape)), 336.72);

  const topLevelCardFeeRow = {
    "TOTAL PAYOUT": 1000,
    "CLEANING FARE": 0,
    "TAXES": 0,
    "LENGTH DISCOUNT": 0,
    "PLATFORM": "airbnb",
    "SOURCE": "airbnb",
    "feeCreditCard": 220.52,
    "AIRBNB RESOLUTION CENTER": 0
  };
  assert.strictEqual(round2(getDraftAccommodationValue(topLevelCardFeeRow)), 779.48);

  const manualSourceRow = {
    "TOTAL PAYOUT": 3130.26,
    "PRE CANCELLATION HOST PAYOUT": 30622,
    "CLEANING FARE": 100,
    "TAXES": 0,
    "LENGTH DISCOUNT": 0,
    "PLATFORM": "manual",
    "SOURCE": "",
    "FEE CREDIT CARD": 0,
    "AIRBNB RESOLUTION CENTER": 0
  };
  assert.strictEqual(round2(getWebsiteVrboFeeValue(manualSourceRow)), 306.52);

  const manualSourceWithManualAcc = {
    ...manualSourceRow,
    "MANUAL ACCOMMODATION": 2192
  };
  assert.strictEqual(round2(getDraftAccommodationValue(manualSourceWithManualAcc)), 1885.48);

  console.log("PASS net-accommodation regression");
  console.log(JSON.stringify({
    HMQ4SPTED3: byCode["HMQ4SPTED3"],
    "HA-QPH3JMF": byCode["HA-QPH3JMF"],
    total
  }, null, 2));
}

run();
