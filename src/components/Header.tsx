import React, { useState, useEffect } from 'react';
import { Menu, X, Zap, Phone } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useSettings } from '../contexts/SettingsContext';

const TelegramIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M11.943 0C5.345 0 0 5.345 0 11.943S5.345 23.886 11.943 23.886 23.886 18.541 23.886 11.943 18.541 0 11.943 0Zm5.433 6.889c.171.004.354.05.43.217a.627.627 0 0 1 .031.17c0 .052-.007.104-.017.154-.092.457-1.548 7.787-1.818 9.014-.085.401-.245.6-.403.743-.342.31-.781.19-1.217-.084-.314-.196-1.913-1.237-2.4-1.608-.161-.122-.373-.378-.037-.689l.001-.002 3.432-3.348c.295-.289.644-.623.985-.968.099-.102.199-.204.285-.292.158-.164.295-.305.295-.305.093-.098.184-.267.031-.41-.107-.1-.281-.087-.417-.057-.135.03-2.873 1.838-5.29 3.368-.303.193-.544.287-.77.281-.292-.007-.572-.139-.793-.263l-.006-.003c-.34-.2-1.301-.615-1.988-.944-.801-.382-1.666-.791-1.666-.791-.688-.332-1.084-.542-1.083-.868.003-.269.403-.402.81-.528 3.176-1 6.332-2.15 9.5-3.223.481-.157.979-.294 1.415-.294Z" />
  </svg>
);

const Header = () => {
  const [clickCount, setClickCount] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { settings } = useSettings();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (clickCount > 0 && clickCount < 7) {
      const timerId = setTimeout(() => setClickCount(0), 3000);
      return () => clearTimeout(timerId);
    }
  }, [clickCount]);

  const handleLogoClick = (e: React.MouseEvent) => {
    // Hidden admin access disabled as requested
    return;
  };

  return (
    <header 
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ease-in-out ${
        scrolled ? 'py-4' : 'py-6'
      }`}
    >
      <div className="container mx-auto px-6">
        <div className={`
          relative flex items-center justify-between px-6 py-3 rounded-2xl transition-all duration-500
          ${scrolled 
            ? 'bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/10 shadow-[0_0_40px_rgba(0,0,0,0.5)]' 
            : 'bg-transparent border border-transparent'}
        `}>
          {/* Logo */}
          <div onClick={handleLogoClick} className="cursor-pointer select-none">
            <Link to="/" className="flex items-center space-x-3 group" onClick={(e) => clickCount > 0 && e.preventDefault()}>
              <div className="relative w-10 h-10 flex items-center justify-center bg-gradient-to-br from-cyan-500/20 to-purple-500/20 rounded-xl border border-white/10 group-hover:border-cyan-500/50 transition-all duration-300 group-hover:shadow-[0_0_30px_rgba(6,182,212,0.3)] overflow-hidden">
                 <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <img 
                  src={settings.site_logo_url || '/cheatloop copy.png'} 
                  alt="Logo" 
                  className="w-6 h-6 object-contain relative z-10 drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-black text-white tracking-wider group-hover:text-cyan-400 transition-colors">
                  {settings.site_name || 'CHEATLOOP'}
                </span>
              </div>
            </Link>
          </div>

          {/* Desktop Nav - Enhanced Buttons */}
          <nav className="hidden md:flex items-center space-x-4 rtl:space-x-reverse">
            {[
              { name: 'HOME', url: '/' },
              { name: 'SHOP', url: '/shop' },
              { name: 'PRODUCTS', url: '/#products' },
              { name: 'FEATURES', url: '/features' },
              { name: 'CONTACT', url: '/contact' },
              { name: 'GALLERY', url: '/winning-photos' },
              { name: 'VIDEOS', url: '/video-studio' },
            ].map((link) => (
              <a 
                key={link.name}
                href={link.url}
                className="relative px-6 py-2 rounded-lg border border-white/10 bg-white/5 overflow-hidden group transition-all duration-300 hover:border-cyan-500/50 hover:shadow-[0_0_20px_rgba(6,182,212,0.2)]"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <span className="relative z-10 text-xs font-bold text-gray-300 group-hover:text-white tracking-widest transition-colors">
                  {link.name}
                </span>
              </a>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center space-x-6 rtl:space-x-reverse">
            <div className="hidden md:flex items-center space-x-4">
              <a href={settings.telegram_url || '#'} target="_blank" rel="noopener noreferrer" className="transition-transform hover:-translate-y-0.5 flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-[#0088cc] hover:bg-[#2ea2e6] text-white shadow-md hover:shadow-lg flex items-center justify-center">
                  <TelegramIcon className="w-4 h-4" />
                </span>
                <span className="text-xs font-bold text-white tracking-widest">Join Telegram</span>
              </a>
            </div>
            
            <a href={settings.telegram_url || '#'} target="_blank" rel="noopener noreferrer" className="md:hidden transition-transform hover:-translate-y-0.5">
              <span className="w-9 h-9 rounded-full bg-[#0088cc] hover:bg-[#2ea2e6] text-white shadow-md hover:shadow-lg flex items-center justify-center">
                <TelegramIcon className="w-4 h-4" />
              </span>
            </a>
            
            {/* Mobile Menu Button */}
            <button 
              className="md:hidden p-2 text-gray-300 hover:text-white transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 mt-4 p-6 bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl animate-fade-in-up">
            <nav className="flex flex-col space-y-4">
              {[
                { name: 'HOME', url: '/' },
                { name: 'SHOP', url: '/shop' },
                { name: 'PRODUCTS', url: '/#products' },
                { name: 'FEATURES', url: '/features' },
                { name: 'CONTACT', url: '/contact' },
                { name: 'GALLERY', url: '/winning-photos' },
                { name: 'VIDEOS', url: '/video-studio' },
              ].map((link) => (
                <a 
                  key={link.name}
                  href={link.url}
                  className="flex items-center space-x-4 p-4 rounded-xl hover:bg-white/5 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span className="text-sm font-bold text-white tracking-widest">{link.name}</span>
                </a>
              ))}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
