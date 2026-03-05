import React from 'react';
import Header from './Header';
import Footer from './Footer';
import { AnimatedBackground } from './AnimatedBackground';
import { ProductsGrid } from './ProductsGrid';

const ShopPage = () => {
  const breadcrumbJson = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://cheatloop.shop/' },
      { '@type': 'ListItem', position: 2, name: 'Shop', item: 'https://cheatloop.shop/shop' },
    ],
  };

  return (
    <div className="min-h-screen bg-[#030014] relative overflow-hidden">
      <AnimatedBackground />
      <div className="relative z-10">
        <Header />
        <div className="container mx-auto px-6 pt-28 pb-10">
          <h1 className="text-3xl md:text-4xl font-black text-white mb-4">CheatLoop Shop</h1>
          <p className="text-slate-400 mb-8">Browse products and purchase securely.</p>
          <ProductsGrid />
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

export default ShopPage;
