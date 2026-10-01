import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, GraduationCap, Users, ArrowRight } from "lucide-react";
import NavBar from "@/components/Navbar";
import BulkImportDialog from "@/components/BulkImportDialog";

// The standalone route for bulk import. The work itself lives in
// BulkImportDialog, which the Students List and Teachers pages open directly —
// this page is just the two entry points for anyone who lands on /admin/import.
const BulkImportPage: React.FC = () => {
  const navigate = useNavigate();
  const [importType, setImportType] = useState<"students" | "teachers" | null>(null);

  const cards = [
    {
      type: "students" as const,
      icon: GraduationCap,
      title: "Import Students",
      columns: "Name (required), Guardian Name, Age, Nationality",
      note: "You'll set each student's email and password on the review screen.",
      listPath: "/students",
      listLabel: "Students List",
    },
    {
      type: "teachers" as const,
      icon: Users,
      title: "Import Teachers",
      columns: "Name, Email (both required)",
      note: "Each teacher logs in with the email from your file. Temporary passwords are generated for you.",
      listPath: "/admin/teachers",
      listLabel: "Teachers",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-2">
          <FileSpreadsheet className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-gray-900">Bulk Import</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Upload an Excel (.xlsx) or CSV file, review every row, then create the accounts.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {cards.map((c) => (
            <Card key={c.type} className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <c.icon className="h-5 w-5 text-primary" /> {c.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 gap-3">
                <div className="text-xs space-y-1">
                  <p><span className="font-medium text-foreground">Columns:</span> {c.columns}</p>
                  <p className="text-muted-foreground">{c.note}</p>
                </div>
                <div className="mt-auto flex flex-col gap-2">
                  <Button className="w-full gap-1" onClick={() => setImportType(c.type)}>
                    <FileSpreadsheet className="h-4 w-4" /> Upload file
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full gap-1 text-muted-foreground"
                    onClick={() => navigate(c.listPath)}
                  >
                    Go to {c.listLabel} <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {importType && (
        <BulkImportDialog
          open
          onOpenChange={(open) => { if (!open) setImportType(null); }}
          type={importType}
        />
      )}
    </div>
  );
};

export default BulkImportPage;
