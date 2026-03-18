# Zapper Edge: Product Feature Specification

## Product Overview
Zapper Edge is an enterprise-grade Managed File Transfer (MFT) platform built on Azure. It provides a secure, governed, and intelligent layer over Azure Blob Storage and ADLS Gen2, designed for complex organizational workflows, partner data exchange, and AI-driven content intelligence.

---

## 1. Feature Matrix by Product Variant

| Feature Category | **Zapper Flow** (Core MFT) | **Zapper Guard** (Security & Compliance) | **Zapper Insight** (AI & Scale) |
| :--- | :--- | :--- | :--- |
| **Data Management** | Secure File Explorer, Search, Rename, Folder Ops | **Core +** Archive Rehydration, Lifecycle Policies | **Shield +** Massive Scale ZIP (ACA) |
| **Access Control** | RBAC, SSO, Org Isolation | **Core +** Geo-Fencing, IP-Restricted SAS | **Shield +** AI-Specific Permissions |
| **SFTP Services** | Managed SFTP Gateway | **Core +** Key & Password Rotation | **Shield +** Automated User Scoping |
| **Security** | PGP Encryption/Decryption | **Core +** Malware Scanning, Sentinel SIEM | **Shield +** AI Document Redaction* |
| **Intelligence** | Basic Activity Auditing | **Core +** Transfer Reports | **Shield +** Foundry AI, Content Understanding |

---

## 2. Detailed Feature Breakdown

### **A. Advanced File Management**
*   **Recursive Search:** Find files instantly across millions of blobs with nested directory traversal.
*   **Smart Previews:** In-browser viewing for PDFs, Images, and Office docs—no download needed.
*   **Intelligent Move/Rename:** Handles complex cloud renaming logic automatically.
*   **Archive Rehydration:** One-click restoration from Archive to Hot tier with High Priority status.

### **B. Security & Compliance (The "Guard" Suite)**
*   **Geo-Fencing:** Restrict access to data based on real-time country detection (Strict or Audit modes).
*   **Credential Rotation:** Automated 4096-bit SSH key generation and secure password regeneration for SFTP users.
*   **Sentinel SIEM Integration:** Native sync with Microsoft Sentinel for threat monitoring and incident response.
*   **Malware Protection:** Auto-scan uploads with Microsoft Defender; automatic tagging and quarantine of infected files.

### **C. Operations & Scale**
*   **ACA Zipper:** Offloads massive folder compression (100MB+) to serverless Azure Container Apps to ensure 100% uptime.
*   **Onboarding Engine:** Bulk-provisioning via CSV for organizations, users, and storage mappings with real-time validation.
*   **Detailed Transfer Reports:** Audit-ready exports for capacity planning and regulatory compliance.

### **D. Content Intelligence (The "Insight" Suite)**
*   **Foundry AI Agents:** Deploy custom AI agents that "understand" your stored documents.
*   **Content Understanding (CU):** Extract structured metadata, sentiment, and key-value pairs from raw files.
*   **Multi-Language Translation:** AI-powered document translation that preserves original formatting.
*   **RAG Chat Playground:** Conversational interface to query your entire file repository using AI.

---

## 3. Positioning & Target Audience

*   **Zapper Flow:** Ideal for general business users replacing legacy FTP with a modern, secure web interface.
*   **Zapper Guard:** Designed for Finance, Healthcare, and Government sectors requiring strict governance and automated security.
*   **Zapper Insight:** Built for knowledge-intensive industries using AI to automate data extraction and process massive scale file archives.

---
*Document generated on February 14, 2026 for Zapper Edge Marketing & Sales.*