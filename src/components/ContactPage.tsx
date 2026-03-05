import React from 'react';
import Header from './Header';
import Footer from './Footer';
import { AnimatedBackground } from './AnimatedBackground';
import { useSettings } from '../contexts/SettingsContext';
import { Mail, MessageCircle, Phone } from 'lucide-react';

const ContactPage = () => {
  const { settings } = useSettings();
  const whatsappLink = settings.whatsapp_url || 'https://api.whatsapp.com/send?phone=9647832941204';
  const telegramLink = settings.telegram_url || '#';
  const discordLink = settings.discord_url || '#';
  const email = settings.support_email || '';

  const breadcrumbJson = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://cheatloop.shop/' },
      { '@type': 'ListItem', position: 2, name: 'Contact', item: 'https://cheatloop.shop/contact' },
    ],
  };

  return (
    <div className="min-h-screen bg-[#030014] relative overflow-hidden">
      <AnimatedBackground />
      <div className="relative z-10">
        <Header />
        <div className="container mx-auto px-6 pt-28 pb-10">
          <h1 className="text-3xl md:text-4xl font-black text-white mb-4">Contact CheatLoop</h1>
          <p className="text-slate-400 mb-10">Reach our support via WhatsApp, Telegram, or Discord.</p>
          <div className="grid md:grid-cols-3 gap-6">
            <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="p-6 rounded-2xl border border-green-500/30 bg-gradient-to-br from-[#128C7E]/30 to-[#25D366]/20 text-white hover:border-green-500/50 transition-all">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-10 h-10 rounded-full bg-gradient-to-br from-[#128C7E] to-[#25D366] flex items-center justify-center shadow-lg shadow-green-500/20">
                  <Phone className="w-5 h-5 text-white" />
                </span>
                <span className="text-lg font-bold">WhatsApp</span>
              </div>
              <p className="text-sm text-white/80">Direct messaging for quick support.</p>
            </a>
            <a href={telegramLink} target="_blank" rel="noopener noreferrer" className="p-6 rounded-2xl border border-[#0088cc]/30 bg-white/5 text-white hover:border-[#0088cc]/50 transition-all">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-10 h-10 rounded-full bg-[#0088cc] flex items-center justify-center shadow-lg shadow-cyan-500/20">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path d="M11.943 0C5.345 0 0 5.345 0 11.943S5.345 23.886 11.943 23.886 23.886 18.541 23.886 11.943 18.541 0 11.943 0Zm5.433 6.889c.171.004.354.05.43.217a.627.627 0 0 1 .031.17c0 .052-.007.104-.017.154-.092.457-1.548 7.787-1.818 9.014-.085.401-.245.6-.403.743-.342.31-.781.19-1.217-.084-.314-.196-1.913-1.237-2.4-1.608-.161-.122-.373-.378-.037-.689l.001-.002 3.432-3.348c.295-.289.644-.623.985-.968.099-.102.199-.204.285-.292.158-.164.295-.305.295-.305.093-.098.184-.267.031-.41-.107-.1-.281-.087-.417-.057-.135.03-2.873 1.838-5.29 3.368-.303.193-.544.287-.77.281-.292-.007-.572-.139-.793-.263l-.006-.003c-.34-.2-1.301-.615-1.988-.944-.801-.382-1.666-.791-1.666-.791-.688-.332-1.084-.542-1.083-.868.003-.269.403-.402.81-.528 3.176-1 6.332-2.15 9.5-3.223.481-.157.979-.294 1.415-.294Z" />
                  </svg>
                </span>
                <span className="text-lg font-bold">Telegram</span>
              </div>
              <p className="text-sm text-white/80">Join our channel for updates.</p>
            </a>
            <a href={discordLink} target="_blank" rel="noopener noreferrer" className="p-6 rounded-2xl border border-[#5865F2]/30 bg-white/5 text-white hover:border-[#5865F2]/50 transition-all">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-10 h-10 rounded-full bg-[#5865F2] flex items-center justify-center shadow-lg shadow-purple-500/20">
                  <MessageCircle className="w-5 h-5 text-white" />
                </span>
                <span className="text-lg font-bold">Discord</span>
              </div>
              <p className="text-sm text-white/80">Community support and announcements.</p>
            </a>
          </div>
          {email && (
            <div className="mt-8 p-6 rounded-2xl border border-white/10 bg-white/5 text-white flex items-center gap-3">
              <Mail className="w-5 h-5" />
              <span className="text-sm">{email}</span>
            </div>
          )}
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

export default ContactPage;
