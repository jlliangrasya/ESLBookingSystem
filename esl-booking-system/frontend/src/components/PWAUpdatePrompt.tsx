import { useRegisterSW } from 'virtual:pwa-register/react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

const PWAUpdatePrompt: React.FC = () => {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white rounded-lg shadow-xl border p-4 max-w-sm animate-fade-in-up">
      <p className="text-sm font-medium mb-2">{t('pwa.updateAvailable')}</p>
      <Button
        size="sm"
        onClick={() => updateServiceWorker(true)}
        className="brand-gradient text-white border-0"
      >
        <RefreshCw className="h-4 w-4 mr-1" />
        {t('pwa.updateNow')}
      </Button>
    </div>
  );
};

export default PWAUpdatePrompt;
