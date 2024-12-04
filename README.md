# Server Diagnostic Script with Discord Alerts

This is a bash script that monitors critical server services and sends alerts to Discord if any of the services are down. It performs a series of diagnostic checks (e.g., uptime, CPU load, memory usage, disk space, and service statuses) and sends a detailed log report.

### Features:
- Monitors the status of key services: **MySQL**, **Apache**, **Nginx**, **PHP-FPM**.
- Generates a detailed log of system diagnostics.
- Sends critical alerts to Discord if any monitored services are down.
- Can be customized to include additional services or checks.

### Requirements:
- **Linux server** (supports CentOS, Ubuntu, or other major distributions)
- **`curl`** installed for sending HTTP requests to Discord
- **`systemctl`** for service status checks

### How to Use:
1. Clone the repository to your server:
   ```bash
   git clone https://github.com/your-username/server-diagnostic-script.git
   cd server-diagnostic-script
![image](https://github.com/user-attachments/assets/c2246c2d-7403-40dd-bf24-809d17cab665)
