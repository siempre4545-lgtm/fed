const run = async () => {
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";
  const url = `${baseUrl}/api/market/prices?keys=GLD,KO,MSFT,TLT,USO,USDKRW`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    const prices = data?.prices || {};
    const fx = data?.fx?.USDKRW;
    const okCount = Object.values(prices).filter((item: any) => item?.ok).length;
    const fxOk = fx?.ok === true;

    if (data?.ok && okCount >= 1 && fxOk) {
      console.log("[PASS] prices ok:", { okCount, fx: fx?.rate });
    } else {
      console.log("[FAIL] prices insufficient:", {
        ok: data?.ok,
        okCount,
        fxOk,
        warnings: data?.meta?.warnings?.slice(0, 3),
      });
    }
  } catch (error) {
    console.log("[FAIL] request failed:", error);
  }
};

run();

export {};
