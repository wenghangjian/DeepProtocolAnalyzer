import { TcpTransport } from "./tcp-transport";
import { SerialTransport } from "./serial-transport";
import { ProtocolError } from "../shared-types";

export class ReconnectManager {
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private reconnectAttempts = new Map<string, number>();
  
  async connectWithRetry(
    sessionId: string,
    connectFn: () => Promise<void>,
    maxRetries = Infinity,
    onStatusChange?: (status: string) => void
  ): Promise<void> {
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        await connectFn();
        this.reconnectAttempts.delete(sessionId);
        onStatusChange?.("connected");
        return;
      } catch (error: any) {
        attempt++;
        this.reconnectAttempts.set(sessionId, attempt);
        
        if (attempt >= maxRetries) {
          onStatusChange?.("error");
          throw new ProtocolError("CONNECTION_FAILED", `Max retries reached: ${error.message}`);
        }
        
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 60000);
        onStatusChange?.(`retrying (${attempt})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  stopReconnect(sessionId: string): void {
    const timer = this.reconnectTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(sessionId);
    }
    this.reconnectAttempts.delete(sessionId);
  }
  
  getAttempts(sessionId: string): number {
    return this.reconnectAttempts.get(sessionId) || 0;
  }
}
