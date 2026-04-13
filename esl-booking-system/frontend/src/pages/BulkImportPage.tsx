import { useState, useContext, useRef } from "react";
import axios from "axios";
import { Upload, Download, Users, GraduationCap, Loader2, CheckCircle, AlertCircle, FileSpreadsheet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import AuthContext from "@/context/AuthContext";
import NavBar from "@/components/Navbar";

interface ImportError {
  row: number;
  email: string;
  reason: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  total: number;
  errors: ImportError[];
}

type TabType = "students" | "teachers";

const BulkImportPage: React.FC = () => {
  const authContext = useContext(AuthContext);
  const token = authContext?.token ?? null;
  const API = import.meta.env.VITE_API_URL;
  const headers = { Authorization: `Bearer ${token}` };

  const [activeTab, setActiveTab] = useState<TabType>("students");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = async (type: TabType) => {
    try {
      const res = await axios.get(`${API}/api/import/template/${type}`, {
        headers,
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${type}_template.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download template");
    }
  };

  const handleUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axios.post(`${API}/api/import/${activeTab}`, formData, {
        headers: { ...headers, "Content-Type": "multipart/form-data" },
      });
      setResult(res.data);
    } catch (err: any) {
      alert(err.response?.data?.message || "Import failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <NavBar />
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-6">
          <FileSpreadsheet className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bulk Import</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={activeTab === "students" ? "default" : "outline"}
            onClick={() => { setActiveTab("students"); setResult(null); }}
            className="gap-1"
          >
            <GraduationCap className="h-4 w-4" /> Students
          </Button>
          <Button
            variant={activeTab === "teachers" ? "default" : "outline"}
            onClick={() => { setActiveTab("teachers"); setResult(null); }}
            className="gap-1"
          >
            <Users className="h-4 w-4" /> Teachers
          </Button>
        </div>

        {/* Upload Area */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Import {activeTab === "students" ? "Students" : "Teachers"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="outline" onClick={() => downloadTemplate(activeTab)} className="gap-1">
                <Download className="h-4 w-4" /> Download Template
              </Button>
              <div className="flex-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }}
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="gap-1 w-full sm:w-auto"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploading ? "Importing..." : "Upload CSV"}
                </Button>
              </div>
            </div>

            <div className="text-xs text-gray-500 space-y-1">
              <p><strong>Required columns:</strong> name, email, password</p>
              {activeTab === "students" && (
                <p><strong>Optional columns:</strong> guardian_name, nationality, age</p>
              )}
              {activeTab === "teachers" && (
                <p><strong>Optional columns:</strong> nationality, age</p>
              )}
              <p>Download the template first to see the correct format.</p>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {result && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                {result.skipped === 0 ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                )}
                Import Results
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{result.imported}</p>
                  <p className="text-xs text-gray-500">Imported</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-amber-600">{result.skipped}</p>
                  <p className="text-xs text-gray-500">Skipped</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-600">{result.total}</p>
                  <p className="text-xs text-gray-500">Total Rows</p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Skipped Rows</h3>
                  <div className="max-h-60 overflow-y-auto border rounded">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">Row</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.errors.map((err, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-sm">{err.row}</TableCell>
                            <TableCell className="text-sm">{err.email}</TableCell>
                            <TableCell className="text-sm text-red-600">{err.reason}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default BulkImportPage;
