import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ArrowLeft, QrCode, MessageCircle } from "lucide-react";
import alipayQr from "@/assets/Alipay.jpg";

interface Package {
  id: number;
  package_name: string;
  session_limit: number;
  price: number;
  subject: string | null;
  duration_minutes: number;
  description: string | null;
  currency: string;
}

const CURRENCIES: { code: string; symbol: string }[] = [
  { code: "PHP", symbol: "₱" },
  { code: "USD", symbol: "$" },
  { code: "CNY", symbol: "¥" },
  { code: "KRW", symbol: "₩" },
  { code: "VND", symbol: "₫" },
  { code: "THB", symbol: "฿" },
  { code: "JPY", symbol: "¥" },
  { code: "MYR", symbol: "RM" },
  { code: "IDR", symbol: "Rp" },
  { code: "TWD", symbol: "NT$" },
  { code: "SGD", symbol: "S$" },
  { code: "HKD", symbol: "HK$" },
  { code: "EUR", symbol: "€" },
  { code: "GBP", symbol: "£" },
];

const currencySymbol = (code: string) => CURRENCIES.find(c => c.code === code)?.symbol ?? code;

interface Teacher {
  id: number;
  name: string;
}

interface Props {
  show: boolean;
  onHide: () => void;
  availablePackages: Package[];
  setSelectedPackage: (id: number) => void;
  confirmPackage: (receiptImage: string | null, teacherId: number | null) => void;
  allowPickTeacher: boolean;
  teachers: Teacher[];
  companyQrImage: string | null;
  paymentMethod?: "encasher" | "communication_platform" | null;
}

const PackageSelectionModal: React.FC<Props> = ({
  show,
  onHide,
  availablePackages,
  setSelectedPackage,
  confirmPackage,
  allowPickTeacher,
  teachers,
  companyQrImage,
  paymentMethod,
}) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<"select" | "payment">("select");
  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(null);
  const [transactionOrderNumber, setTransactionOrderNumber] = useState("");
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  const [filterDuration, setFilterDuration] = useState<string>("all");
  const [filterCurrency, setFilterCurrency] = useState<string>("all");

  const selectedPkg = availablePackages.find((p) => p.id === selectedPackageId);

  const uniqueDurations = useMemo(
    () => [...new Set(availablePackages.map((p) => p.duration_minutes))].sort((a, b) => a - b),
    [availablePackages]
  );
  const uniqueCurrencies = useMemo(
    () => [...new Set(availablePackages.map((p) => p.currency))].sort(),
    [availablePackages]
  );

  const filteredPackages = useMemo(() => {
    return availablePackages.filter((pkg) => {
      if (filterDuration !== "all" && pkg.duration_minutes !== Number(filterDuration)) return false;
      if (filterCurrency !== "all" && pkg.currency !== filterCurrency) return false;
      return true;
    });
  }, [availablePackages, filterDuration, filterCurrency]);

  const handlePackageSelect = (packageId: number) => {
    setSelectedPackageId(packageId);
    setSelectedPackage(packageId);
  };

  const handleConfirm = () => {
    confirmPackage(transactionOrderNumber || null, selectedTeacherId ? Number(selectedTeacherId) : null);
    handleReset();
  };

  const handleReset = () => {
    setStep("select");
    setSelectedPackageId(null);
    setTransactionOrderNumber("");
    setSelectedTeacherId("");
    setFilterDuration("all");
    setFilterCurrency("all");
  };

  const handleClose = () => {
    handleReset();
    onHide();
  };

  return (
    <Dialog open={show} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === "select" ? t("student.selectPackage") : t("student.paymentEnrollment")}
          </DialogTitle>
          <DialogDescription>
            {step === "select"
              ? t("student.choosePackage")
              : t("student.enrollingIn", { name: selectedPkg?.package_name })}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Package Selection */}
        {step === "select" && (
          <>
            {/* Filters — only show when there are options to filter */}
            {availablePackages.length > 0 && (uniqueDurations.length > 1 || uniqueCurrencies.length > 1) && (
              <div className="flex items-center gap-2">
                {uniqueDurations.length > 1 && (
                  <Select value={filterDuration} onValueChange={setFilterDuration}>
                    <SelectTrigger className="h-8 text-xs w-auto min-w-[110px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("student.filterDuration")}: {t("student.filterAll")}</SelectItem>
                      {uniqueDurations.map((d) => (
                        <SelectItem key={d} value={String(d)}>{t("student.minutesShort", { min: d })}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {uniqueCurrencies.length > 1 && (
                  <Select value={filterCurrency} onValueChange={setFilterCurrency}>
                    <SelectTrigger className="h-8 text-xs w-auto min-w-[110px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("student.filterCurrency")}: {t("student.filterAll")}</SelectItem>
                      {uniqueCurrencies.map((c) => (
                        <SelectItem key={c} value={c}>{currencySymbol(c)} {c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <div className="max-h-72 overflow-y-auto space-y-2">
              {filteredPackages.length === 0 ? (
                <div className="text-center text-muted-foreground py-6 border rounded-lg">
                  {t("student.noPackages")}
                </div>
              ) : (
                filteredPackages.map((pkg) => (
                  <div
                    key={pkg.id}
                    onClick={() => handlePackageSelect(pkg.id)}
                    className={cn(
                      "cursor-pointer rounded-lg border p-3 transition-colors",
                      selectedPackageId === pkg.id
                        ? "bg-[#EEF6FA] ring-1 ring-[#D0E8F0]"
                        : "hover:bg-muted"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm">{pkg.package_name}</div>
                      <div className="text-sm font-semibold">
                        {currencySymbol(pkg.currency)}{Number(pkg.price).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{pkg.subject || "—"}</span>
                      <span>·</span>
                      <span>{pkg.session_limit} × {pkg.duration_minutes}min</span>
                    </div>
                    {pkg.description && (
                      <div className="text-xs text-muted-foreground mt-1">{pkg.description}</div>
                    )}
                  </div>
                ))
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>{t("student.cancel")}</Button>
              <Button onClick={() => setStep("payment")} disabled={!selectedPackageId}>
                {t("student.next")}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 2: Payment */}
        {step === "payment" && (
          <>
            <div className="space-y-4 py-1">
              {/* Payment instructions based on company payment_method */}
              {paymentMethod === "encasher" ? (
                <div className="flex flex-col items-center gap-3 border rounded-lg p-4 bg-muted/30">
                  <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                    <QrCode className="h-4 w-4" />
                    {t("student.scanAlipay")}
                  </div>
                  <img src={alipayQr} alt="Alipay QR" className="max-w-[180px] rounded-lg" />
                  <p className="text-xs text-muted-foreground text-center">
                    {t("student.amount")} <span className="font-semibold text-foreground">{currencySymbol(selectedPkg?.currency ?? "PHP")}{Number(selectedPkg?.price ?? 0).toLocaleString()}</span>
                  </p>
                  <div className="w-full bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs space-y-1.5">
                    <p className="font-semibold text-amber-800">{t("student.instructions")}</p>
                    <ol className="list-decimal list-inside space-y-1 text-amber-700">
                      <li>{t("student.alipayInst1")}</li>
                      <li>{t("student.alipayInst2")}</li>
                      <li>{t("student.alipayInst3")}</li>
                      <li>{t("student.alipayInst4")}</li>
                    </ol>
                  </div>
                </div>
              ) : paymentMethod === "communication_platform" ? (
                <div className="flex flex-col items-center gap-3 border rounded-lg p-4 bg-blue-50/60">
                  <MessageCircle className="h-8 w-8 text-blue-500" />
                  <p className="text-sm font-medium text-center">
                    {t("student.commPlatformMsg")}
                  </p>
                  <p className="text-xs text-muted-foreground text-center">
                    {t("student.commPlatformNote")}
                  </p>
                  <p className="text-xs text-muted-foreground text-center">
                    {t("student.amount")} <span className="font-semibold text-foreground">{currencySymbol(selectedPkg?.currency ?? "PHP")}{Number(selectedPkg?.price ?? 0).toLocaleString()}</span>
                  </p>
                </div>
              ) : companyQrImage ? (
                <div className="flex flex-col items-center gap-2 border rounded-lg p-4 bg-muted/30">
                  <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                    <QrCode className="h-4 w-4" />
                    {t("student.scanToPay")}
                  </div>
                  <img src={companyQrImage} alt="Payment QR" className="max-w-[160px] rounded-lg" />
                  <p className="text-xs text-muted-foreground text-center">
                    {t("student.amount")} <span className="font-semibold text-foreground">{currencySymbol(selectedPkg?.currency ?? "PHP")}{Number(selectedPkg?.price ?? 0).toLocaleString()}</span>
                  </p>
                </div>
              ) : (
                <div className="border rounded-lg p-3 bg-muted/20 text-sm text-muted-foreground text-center">
                  {t("student.contactAdmin")}
                </div>
              )}

              {/* Transaction Order Number */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  {t("student.transactionLabel")} {paymentMethod === "communication_platform" ? t("student.optional") : <span className="text-destructive">*</span>}
                </Label>
                <p className="text-xs text-muted-foreground">{t("student.transactionHint")}</p>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  placeholder={t("student.transactionPlaceholder")}
                  value={transactionOrderNumber}
                  onChange={(e) => setTransactionOrderNumber(e.target.value.replace(/\D/g, "").slice(0, 5))}
                />
              </div>

              {/* Teacher picker */}
              {allowPickTeacher && teachers.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">{t("student.preferredTeacher")}</Label>
                  <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("student.letAdminAssign")} />
                    </SelectTrigger>
                    <SelectContent>
                      {teachers.map((teacher) => (
                        <SelectItem key={teacher.id} value={String(teacher.id)}>{teacher.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("select")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> {t("student.back")}
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={paymentMethod === "communication_platform" ? false : transactionOrderNumber.length !== 5}
              >
                {t("student.confirmEnrollment")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PackageSelectionModal;
