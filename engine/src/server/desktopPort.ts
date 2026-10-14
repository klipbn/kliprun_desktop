import { createServer } from "node:net";

export async function availableLoopbackPort(): Promise<number> {
  const listener = createServer();
  await new Promise<void>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const address = listener.address();
  await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  if (!address || typeof address === "string") throw new Error("Unable to allocate loopback port");
  return address.port;
}
