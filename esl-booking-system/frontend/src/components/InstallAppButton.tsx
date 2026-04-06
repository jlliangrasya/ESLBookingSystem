import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWAInstall } from '@/hooks/usePWAInstall';

interface Props {
  variant?: 'white' | 'default';
}

const InstallAppButton: React.FC<Props> = ({ variant = 'default' }) => {
  const { t } = useTranslation();
  const { canInstall, install } = usePWAInstall();

  if (!canInstall) return null;

  return (
    <Button
      size="sm"
      className={
        variant === 'white'
          ? 'bg-white/15 text-white border border-white/40 hover:bg-white/25 backdrop-blur-sm transition-colors'
          : 'brand-gradient text-white border-0'
      }
      onClick={install}
    >
      <Download className="h-4 w-4 mr-1" />
      {t('pwa.installApp')}
    </Button>
  );
};

export default InstallAppButton;
