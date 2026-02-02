const run = async () => {
  try {
    const response = await fetch(
      "http://localhost:3000/api/market/quote?provider=stooq&ticker=SPY"
    );
    const data = await response.json();
    if (typeof data.price === "number") {
      console.log("[PASS] quote price:", data.price);
    } else {
      console.log("[WARN] quote response:", data);
    }
  } catch (error) {
    console.log("[WARN] fetch failed:", error);
  }
};

run();

export {};
