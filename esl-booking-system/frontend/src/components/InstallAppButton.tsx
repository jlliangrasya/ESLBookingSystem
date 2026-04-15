import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, X, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWAInstall } from '@/hooks/usePWAInstall';

interface Props {
  variant?: 'white' | 'default';
}

const InstallAppButton: React.FC<Props> = ({ variant = 'default' }) => {
  const { t } = useTranslation();
  const { canInstallNative, isInstalled, platform, install } = usePWAInstall();
  const [showInstructions, setShowInstructions] = useState(false);

  if (isInstalled) return null;

  const btnClass = variant === 'white'
    ? 'bg-white/15 text-white border border-white/40 hover:bg-white/25 backdrop-blur-sm transition-colors'
    : 'brand-gradient text-white border-0';

  const handleClick = async () => {
    if (canInstallNative) {
      await install();
    } else {
      setShowInstructions(true);
    }
  };

  return (
    <>
      <Button size="sm" className={btnClass} onClick={handleClick}>
        <Download className="h-4 w-4 mr-1" />
        {t('pwa.installApp')}
      </Button>

      {showInstructions && (
        <div className="fixed inset-0 z-100 flex items-end sm:items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 relative">
            <button
              onClick={() => setShowInstructions(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="brand-gradient rounded-xl p-2">
                <Smartphone className="h-5 w-5 text-white" />
              </div>
              <h3 className="font-semibold text-gray-900">{t('pwa.installTitle')}</h3>
            </div>

            {platform === 'ios' && (
              <ol className="space-y-3 text-sm text-gray-700">
                <li className="flex gap-2">
                  <span className="brand-gradient text-white rounded-full h-5 w-5 flex items-center justify-center text-xs shrink-0 mt-0.5">1</span>
                  <span>{t('pwa.iosStep1')}</span>
                </li>
                <li className="flex gap-2">
                  <span className="brand-gradient text-white rounded-full h-5 w-5 flex items-center justify-center text-xs shrink-0 mt-0.5">2</span>
                  <span>{t('pwa.iosStep2')}</span>
                </li>
                <li className="flex gap-2">
                  <span className="brand-gradient text-white rounded-full h-5 w-5 flex items-center justify-center text-xs shrink-0 mt-0.5">3</span>
                  <span>{t('pwa.iosStep3')}</span>
                </li>
              </ol>
            )}

            {(platform === 'android-manual' || platform === 'desktop-manual') && (
              <ol className="space-y-3 text-sm text-gray-700">
                <li className="flex gap-2">
                  <span className="brand-gradient text-white rounded-full h-5 w-5 flex items-center justify-center text-xs shrink-0 mt-0.5">1</span>
                  <span>{t('pwa.androidStep1')}</span>
                </li>
                <li className="flex gap-2">
                  <span className="brand-gradient text-white rounded-full h-5 w-5 flex items-center justify-center text-xs shrink-0 mt-0.5">2</span>
                  <span>{t('pwa.androidStep2')}</span>
                </li>
                <li className="flex gap-2">
                  <span className="brand-gradient text-white rounded-full h-5 w-5 flex items-center justify-center text-xs shrink-0 mt-0.5">3</span>
                  <span>{t('pwa.androidStep3')}</span>
                </li>
              </ol>
            )}

            <Button
              className="w-full mt-5 brand-gradient text-white border-0"
              onClick={() => setShowInstructions(false)}
            >
              {t('pwa.gotIt')}
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

export default InstallAppButton;
