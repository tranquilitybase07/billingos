import { Card, CardContent } from "@/components/ui/card";

interface TableColumn {
  title: string;
  key: string;
}

interface TableSectionProps {
  title: string;
  columns: TableColumn[];
  data?: any[]; // optional array of data objects
}

export const TableSection = ({ title, columns, data }: TableSectionProps) => {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-popover-foreground">{title}</h2>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border">
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className="text-left p-4 text-sm font-medium text-muted-foreground"
                    >
                      {col.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data && data.length > 0 ? (
                  data.map((row, idx) => (
                    <tr key={idx}>
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className="p-4 text-sm text-popover-foreground"
                        >
                          {row[col.key] ?? "-"}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="text-center text-sm font-medium py-12 text-popover-foreground bg-base hover:bg-black/20"
                    >
                      No Results
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
