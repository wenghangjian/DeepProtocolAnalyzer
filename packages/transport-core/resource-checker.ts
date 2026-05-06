import { SerialPort } from "serialport";
import net from "net";

export async function checkSerialPort(path: string): Promise<{ available: boolean; error?: string }> {
  try {
    const port = new SerialPort({ path, baudRate: 9600, autoOpen: false });
    await new Promise((resolve, reject) => {
      port.open((err) => err ? reject(err) : resolve(null));
    });
    port.close();
    return { available: true };
  } catch (err: any) {
    return { available: false, error: err.message };
  }
}

export async function checkTcpPort(host: string, port: number): Promise<{ available: boolean; error?: string }> {
  return new Promise((resolve) => {
    const socket = net.connect(port, host);
    socket.on("connect", () => {
      socket.destroy();
      resolve({ available: true });
    });
    socket.on("error", (err: any) => {
      resolve({ available: false, error: err.message });
    });
    setTimeout(() => {
      socket.destroy();
      resolve({ available: false, error: "Timeout" });
    }, 3000);
  });
}
