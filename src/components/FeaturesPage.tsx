import React from 'react';
import Header from './Header';
import Footer from './Footer';
import { AnimatedBackground } from './AnimatedBackground';
import { Shield, Zap, Gauge } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';

const FeaturesPage = () => {
  const { settings } = useSettings();

  const items = [
    {
      icon: Shield,
      title: settings.feature_1_title || '100% Safe',
      desc: settings.feature_1_desc || 'Protected from bans with smart safety.',
    },
    {
      icon: Zap,
      title: settings.feature_2_title || 'Precision Tools',
      desc: settings.feature_2_desc || 'Accurate ESP and smooth controls.',
    },
    {
      icon: Gauge,
      title: settings.feature_3_title || 'High Performance',
      desc: settings.feature_3_desc || 'Optimized for stability and speed.',
    },
  ];

  const breadcrumbJson = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://cheatloop.shop/' },
      { '@type': 'ListItem', position: 2, name: 'Features', item: 'https://cheatloop.shop/features' },
    ],
  };

  return (
    <div className="min-h-screen bg-[#030014] relative overflow-hidden">
      <AnimatedBackground />
      <div className="relative z-10">
        <Header />
        <div className="container mx-auto px-6 pt-28 pb-10">
          <h1 className="text-3xl md:text-4xl font-black text-white mb-4">CheatLoop Features</h1>
          <p className="text-slate-400 mb-10">Core capabilities designed for safe, precise gameplay.</p>
          <div className="grid md:grid-cols-3 gap-6">
            {items.map((it, idx) => (
              <div key={idx} className="p-6 rounded-2xl border border-white/10 bg-white/5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 mb-4">
                  <it.icon className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">{it.title}</h2>
                <p className="text-slate-400 text-sm">{it.desc}</p>
              </div>
            ))}
          </div>
        </div>
        <Footer />
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJson) }}
      />
    </div>
  );
};

export default FeaturesPage;
