const run = async () => {
  try {
    const response = await fetch(
      "http://localhost:3000/api/macro/thursday?date=2026-01-08"
    );
    const data = await response.json();
    const ids = data?.items?.map((item: { id: string }) => item.id) || [];
    const required = ["asset.GLD", "asset.DXY", "indicator.M2", "indicator.STLFSI4"];
    const hasRequired = required.every((id) => ids.includes(id));
    if (data?.ok && ids.length > 0 && hasRequired) {
      console.log("[PASS] thursday snapshot ok:", ids.length);
    } else {
      console.log("[FAIL] snapshot missing items:", { ok: data?.ok, ids: ids.slice(0, 10) });
    }
  } catch (error) {
    console.log("[FAIL] request failed:", error);
  }
};

run();

export {};
