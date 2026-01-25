import { redirect } from "next/navigation";

const MacroTraceTablePage = () => {
  redirect("/macro-trace?view=table");
};

export default MacroTraceTablePage;
