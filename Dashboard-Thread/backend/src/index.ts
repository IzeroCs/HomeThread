/**
 * Backend: Test Serial/UART kết nối với ESP32-H2 ot-br.
 */

import "dotenv/config";
import { SerialPortService } from "./services/serialPort";
import { CLIWrapper } from "./services/cliWrapper";

const SERIAL_PORT = process.env.SERIAL_PORT ?? "/dev/ttyACM0";
const SERIAL_BAUD_RATE = parseInt(process.env.SERIAL_BAUD_RATE ?? "115200", 10);
const CLI_TIMEOUT_MS = parseInt(process.env.CLI_TIMEOUT_MS ?? "5000", 10);

// Khởi tạo SerialPort và CLI wrapper
const serialPort = new SerialPortService({
  path: SERIAL_PORT,
  baudRate: SERIAL_BAUD_RATE,
});

const cliWrapper = new CLIWrapper(serialPort, CLI_TIMEOUT_MS);

// Test kết nối serial port
async function testSerialConnection() {
  console.log("=".repeat(50));
  console.log("Testing Serial Port Connection");
  console.log("=".repeat(50));
  console.log(`Port: ${SERIAL_PORT}`);
  console.log(`Baud Rate: ${SERIAL_BAUD_RATE}`);
  console.log(`Timeout: ${CLI_TIMEOUT_MS}ms`);
  console.log("=".repeat(50));

  try {
    console.log(`\nAttempting to connect to ${SERIAL_PORT}...`);
    await serialPort.open();
    console.log("Serial port connected successfully");
    console.log(`Status:`, serialPort.getStatus());

    // Đăng ký listener để log mọi dữ liệu từ serial port
    console.log("\nListening for data from serial port...");
    serialPort.onData((data) => {
      console.log(`[RX] ${data}`);
    });

    // Đợi một chút để thiết bị sẵn sàng
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Test kết nối bằng cách gửi lệnh đơn giản
    console.log("\nTesting with 'state' command...");
    try {
      const testResponse = await cliWrapper.executeCommand("state");
      console.log("\nCommand executed successfully");
      console.log("Response output:");
      testResponse.output.forEach((line) => {
        console.log(`  ${line}`);
      });
      if (testResponse.error) {
        console.log(`Error: ${testResponse.error}`);
      }
    } catch (testError) {
      console.warn("\nTest command failed:");
      console.warn(testError instanceof Error ? testError.message : testError);
    }

    // Giữ kết nối mở để tiếp tục nhận dữ liệu
    console.log("\nSerial port is open. Press Ctrl+C to exit.");
    console.log("Listening for incoming data...\n");

  } catch (error) {
    console.error("\nFailed to connect to serial port:");
    console.error(error instanceof Error ? error.message : error);
    console.error("\nTroubleshooting:");
    console.error("  1. Check if device is connected and powered on");
    console.error("  2. Verify port path is correct:", SERIAL_PORT);
    console.error("  3. Check user permissions:");
    console.error("     sudo usermod -a -G dialout $USER");
    console.error("     (then logout and login again)");
    console.error("  4. Check if port is available:");
    console.error("     ls -l /dev/ttyACM*");
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n\nShutting down...");
  await serialPort.close();
  console.log("Serial port closed");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n\nShutting down...");
  await serialPort.close();
  console.log("Serial port closed");
  process.exit(0);
});

// Chạy test
testSerialConnection();
