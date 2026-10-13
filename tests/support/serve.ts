// Boots the real Express app (same createApp the Vercel function uses) on
// PORT for the security tests. Each spawned process = one "instance".
import { createApp } from "../../server/app";

const { server } = await createApp();
server.listen(Number(process.env.PORT), "127.0.0.1", () => console.log("READY"));
