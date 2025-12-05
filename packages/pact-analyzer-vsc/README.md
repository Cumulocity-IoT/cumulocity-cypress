# C8yPact Analyzer

A C8yPact file viewer for VS Code. Analyze and visualize Cumulocity pact files containing serialized `C8yPact` data.

## Features

- 📊 **Visual Analysis**: Beautiful, interactive visualization of pact files
- 🔍 **Search & Filter**: Filter requests by method, status code, or search text
- 📈 **Statistics**: View request counts, methods, status codes, and average duration
- 🔎 **Detailed View**: Expand any record to see full request/response details
- 🎨 **VS Code Theme Integration**: Automatically adapts to your VS Code theme
- ⌨️ **Keyboard Shortcuts**: 
  - `Ctrl/Cmd + F`: Focus search
  - `Ctrl/Cmd + E`: Expand all records
  - `Ctrl/Cmd + Shift + E`: Collapse all records

## Usage

1. Open a C8yPact JSON file in VS Code
2. Right-click in the editor and select **"C8yPact: Analyze File"**
   - Or use the Command Palette (`Ctrl/Cmd + Shift + P`) and search for "C8yPact: Analyze File"
3. The analyzer will open in a new panel beside your file

## C8yPact File Format

The extension recognizes C8yPact files with the following structure:

```json
{
  "id": "pact-id",
  "info": {
    "title": ["Test Suite", "Test Name"],
    "baseUrl": "https://example.c8y.io",
    "tenant": "t12345",
    "recordingMode": "refresh",
    "version": {
      "system": "1.0.0",
      "c8ypact": "1.0.0"
    }
  },
  "records": [
    {
      "request": {
        "method": "GET",
        "url": "/inventory/managedObjects",
        "headers": {}
      },
      "response": {
        "status": 200,
        "statusText": "OK",
        "headers": {},
        "body": {},
        "duration": 150
      }
    }
  ]
}
```

## Requirements

- VS Code 1.85.0 or higher

## Extension Settings

This extension contributes the following command:

- `c8yPactAnalyzer.analyze`: Analyze the currently open C8y Pact file

## Known Issues

- Files larger than 5MB may have limited support due to VS Code API constraints
