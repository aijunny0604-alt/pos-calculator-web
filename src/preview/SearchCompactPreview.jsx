import { useState } from 'react';
import MainPOS from '../pages/MainPOS';

const products = ['CH 200 76', 'CH 200 77', 'CH 201 76', 'CH 200 78'].map((name, i) => ({ id:i+1, name, category:'소음기', stock:10, wholesale:10000, retail:12000 }));
export default function SearchCompactPreview() {
  const [cart, setCart] = useState([]);
  return <div style={{height:'100dvh'}}><MainPOS products={products} cart={cart} setCart={setCart} priceType="wholesale" setPriceType={()=>{}} customers={[]} /></div>;
}
