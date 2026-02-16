/**
 * Utility to generate and download a CSV file from an array of objects
 */
export function downloadCSV(data: any[], filename: string) {
  if (data.length === 0) return;

  // Extract headers from keys of the first object
  const headers = Object.keys(data[0]);
  
  // Create rows
  const rows = data.map(row => {
    return headers.map(header => {
      let value = row[header] ?? '';
      
      // Escape double quotes and wrap in double quotes if it contains commas
      if (typeof value === 'string') {
        value = value.replace(/"/g, '""');
        if (value.includes(',') || value.includes('\n') || value.includes('"')) {
          value = `"${value}"`;
        }
      }
      
      return value;
    }).join(',');
  });

  // Combine headers and rows
  const csvContent = [headers.join(','), ...rows].join('\n');
  
  // Create blob and trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
