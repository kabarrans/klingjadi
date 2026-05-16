import React, { useState, useRef } from 'react';
import { UploadCloud, ImageIcon, Video, Wand2, RefreshCw, AlertCircle, CheckCircle2, Loader2, PlayCircle, Settings, ShieldAlert } from 'lucide-react';

export default function App() {
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const [imageFile, setImageFile] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  
  const [imageInputMode, setImageInputMode] = useState('url');
  const [videoInputMode, setVideoInputMode] = useState('url');
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [resultVideo, setResultVideo] = useState(null);
  
  // State Proxy (Pilihan Server)
  const [proxyType, setProxyType] = useState('corsproxy'); 
  const [proxyCount, setProxyCount] = useState(46);
  const [apiKey, setApiKey] = useState('');

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setErrorMsg('Tolong unggah file gambar yang valid.');
        return;
      }
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      setErrorMsg('');
    }
  };

  const handleVideoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith('video/')) {
        setErrorMsg('Tolong unggah file video yang valid.');
        return;
      }
      setVideoFile(file);
      setVideoPreview(URL.createObjectURL(file));
      setErrorMsg('');
    }
  };

  const toBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });

  // Fungsi untuk membangun URL dengan Proxy yang dipilih
  const getFetchUrl = (targetUrl) => {
    if (proxyType === 'corsproxy') return `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
    if (proxyType === 'thingproxy') return `https://thingproxy.freeboard.io/fetch/${targetUrl}`;
    if (proxyType === 'codetabs') return `https://api.codetabs.com/v1/proxy?quest=${targetUrl}`;
    return targetUrl; // Direct (No Proxy)
  };

  const handleGenerate = async () => {
    if (!apiKey.trim()) {
      setErrorMsg('API Key Magnific tidak boleh kosong!');
      return;
    }

    try {
      let finalImageUrl = '';
      let finalVideoUrl = '';

      if (imageInputMode === 'url') {
        if (!imageUrl.trim()) throw new Error("URL Foto Referensi tidak boleh kosong!");
        finalImageUrl = imageUrl.trim();
      } else {
        if (!imageFile) throw new Error("Harap unggah Foto Referensi terlebih dahulu!");
        finalImageUrl = await toBase64(imageFile);
      }

      if (videoInputMode === 'url') {
        if (!videoUrl.trim()) throw new Error("URL Video Referensi tidak boleh kosong!");
        finalVideoUrl = videoUrl.trim();
      } else {
        if (!videoFile) throw new Error("Harap unggah Video Referensi terlebih dahulu!");
        finalVideoUrl = await toBase64(videoFile);
      }

      setIsGenerating(true);
      setErrorMsg('');
      setResultVideo(null);
      setProxyCount(prev => (prev > 0 ? prev - 1 : 49));
      setProgressText(`Mengirim payload via ${proxyType === 'none' ? 'Koneksi Langsung' : proxyType}...`);

      const apiUrl = 'https://api.magnific.com/v1/ai/video/kling-v3-motion-control-pro';
      const fetchUrl = getFetchUrl(apiUrl);

      // POST Request untuk mengantri Task
      const submitResponse = await fetch(fetchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-magnific-api-key': apiKey
        },
        body: JSON.stringify({
          image_url: finalImageUrl,
          video_url: finalVideoUrl,
          character_orientation: 'video',
          cfg_scale: 0.5
        })
      });

      if (!submitResponse.ok) {
        const errorText = await submitResponse.text();
        let errorMessage = `Server error: ${submitResponse.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.message || errorJson.error || errorMessage;
        } catch (e) {}
        throw new Error(errorMessage);
      }

      const submitData = await submitResponse.json();
      const taskData = submitData.data || submitData;
      const jobId = taskData.task_id || taskData.id;

      if (!jobId) {
        throw new Error('Format respon tidak dikenali. Tidak ada Task ID.');
      }

      let isCompleted = false;
      let attempts = 0;
      const maxAttempts = 60; // 10 menit batas waktu

      setProgressText('Berhasil masuk antrean! Mengecek status video...');

      while (!isCompleted && attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 10000)); // Tunggu 10 detik
        attempts++;
        setProgressText(`Mengecek status generasi ke Magnific... (Percobaan ${attempts}/${maxAttempts})`);

        const statusApiUrl = `https://api.magnific.com/v1/ai/video/kling-v3-motion-control-pro/${jobId}`;
        const statusFetchUrl = getFetchUrl(statusApiUrl);

        const statusResponse = await fetch(statusFetchUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'x-magnific-api-key': apiKey
          }
        });

        if (!statusResponse.ok) continue;

        const statusResult = await statusResponse.json();
        const statusDetails = statusResult.data || statusResult;
        const status = statusDetails.status?.toUpperCase();

        if (status === 'COMPLETED' || status === 'SUCCESS') {
          isCompleted = true;
          const resultUrl = statusDetails.generated && statusDetails.generated[0];
          if (resultUrl) {
            setResultVideo(resultUrl);
            setProgressText('Selesai! Video berhasil di-render!');
          } else {
            throw new Error('Video selesai diproses tetapi URL video kosong.');
          }
        } 
        else if (status === 'FAILED' || status === 'ERROR') {
          throw new Error(statusDetails.error || statusDetails.message || 'Generasi video gagal di sisi Magnific.');
        }
      }

      if (!isCompleted) {
        throw new Error('Waktu habis (Timeout 10 Menit). Silakan cek riwayat Anda di Dashboard Magnific.');
      }

    } catch (err) {
      let extraHint = "";
      if (err.message === "Failed to fetch" || err.message.includes("NetworkError")) {
        extraHint = ` (Solusi: Server proxy '${proxyType}' diblokir oleh Magnific/Cloudflare. Silakan ganti ke pilihan Proxy lain di menu atas, atau pilih 'Koneksi Langsung' jika memakai ekstensi Allow CORS).`;
      }
      setErrorMsg((err.message || 'Terjadi kesalahan sistem atau jaringan.') + extraHint);
    } finally {
      setIsGenerating(false);
      if (!errorMsg) setProgressText('');
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-gray-200 font-sans p-6 pb-20">
      
      {/* Top Banner (Proxy Status) */}
      <div className="max-w-5xl mx-auto mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium px-4 py-2 rounded-full inline-flex items-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
          <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" />
          Proxy dirotasi — {proxyCount}/49 tersisa
        </div>

        <div className="flex items-center gap-2 bg-[#18181b] border border-gray-800 rounded-lg px-3 py-1.5">
          <ShieldAlert className="w-4 h-4 text-orange-400" />
          <span className="text-xs text-gray-400 font-medium">Jalur Koneksi API:</span>
          <select 
            value={proxyType} 
            onChange={(e) => setProxyType(e.target.value)}
            className="bg-[#09090b] text-xs text-gray-200 border border-gray-700 rounded p-1 outline-none focus:border-purple-500"
          >
            <option value="corsproxy">Proxy 1 (corsproxy.io)</option>
            <option value="thingproxy">Proxy 2 (thingproxy)</option>
            <option value="codetabs">Proxy 3 (codetabs)</option>
            <option value="none">Koneksi Langsung (Wajib Ekstensi CORS)</option>
          </select>
        </div>
      </div>

      <div className="max-w-5xl mx-auto bg-[#18181b] rounded-[2rem] border border-gray-800 p-8 shadow-2xl relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1 bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-50"></div>

        <div className="text-center mb-10 mt-2">
          <h1 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-blue-500 mb-3 tracking-tight">
            Kling V3 Motion Control
          </h1>
          <p className="text-gray-500 text-sm md:text-base max-w-xl mx-auto">
            Hasilkan video pergerakan AI tingkat lanjut dengan mengirim referensi gambar dan video langsung ke Magnific API.
          </p>
        </div>

        <div className="bg-[#121214] border border-purple-500/20 rounded-2xl p-5 mb-8 shadow-inner">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
            <Settings className="w-4 h-4 text-purple-400" />
            Magnific API Key
          </label>
          <input 
            type="password" 
            placeholder="Masukkan x-magnific-api-key (Contoh: mag_xxxxxxxxxxx)" 
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full bg-[#09090b] border border-gray-800 rounded-lg px-4 py-3 text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all font-mono text-sm"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <div className="lg:col-span-1 space-y-6">
            
            {}
            <div className="bg-[#121214] border border-gray-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-purple-400" />
                  Foto Referensi
                </h2>
                <div className="flex bg-[#18181b] rounded-lg p-0.5 border border-gray-800">
                  <button onClick={() => setImageInputMode('url')} className={`text-[10px] px-2.5 py-1 rounded-md transition-colors ${imageInputMode === 'url' ? 'bg-purple-500/20 text-purple-400 font-bold' : 'text-gray-500 hover:text-gray-300'}`}>URL Image</button>
                  <button onClick={() => setImageInputMode('file')} className={`text-[10px] px-2.5 py-1 rounded-md transition-colors ${imageInputMode === 'file' ? 'bg-purple-500/20 text-purple-400 font-bold' : 'text-gray-500 hover:text-gray-300'}`}>Lokal File</button>
                </div>
              </div>
              
              {imageInputMode === 'url' ? (
                <div className="space-y-3">
                  <input 
                    type="url" 
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://imgur.com/...jpg" 
                    className="w-full bg-[#09090b] border border-gray-700 rounded-lg px-3 py-2.5 text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-sm"
                  />
                  {imageUrl && (
                    <div className="aspect-square rounded-xl border border-gray-800 overflow-hidden bg-[#09090b]">
                      <img src={imageUrl} alt="Reference Preview" className="w-full h-full object-cover" onError={(e) => e.target.style.display = 'none'} />
                    </div>
                  )}
                </div>
              ) : (
                <div 
                  onClick={() => imageInputRef.current?.click()}
                  className={`relative group cursor-pointer aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center overflow-hidden transition-all ${
                    imagePreview ? 'border-purple-500/50' : 'border-gray-700 hover:border-purple-500/50 hover:bg-[#18181b]'
                  }`}
                >
                  <input type="file" ref={imageInputRef} className="hidden" accept="image/*" onChange={handleImageChange} />
                  {imagePreview ? (
                    <>
                      <img src={imagePreview} alt="Reference" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                        <span className="text-white text-sm font-medium bg-black/50 px-3 py-1.5 rounded-lg">Ganti Foto</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-center p-4">
                      <UploadCloud className="w-8 h-8 text-gray-500 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                      <p className="text-sm text-gray-300 font-medium">Unggah foto</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {}
            <div className="bg-[#121214] border border-gray-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                  <Video className="w-4 h-4 text-blue-400" />
                  Video Motion
                </h2>
                <div className="flex bg-[#18181b] rounded-lg p-0.5 border border-gray-800">
                  <button onClick={() => setVideoInputMode('url')} className={`text-[10px] px-2.5 py-1 rounded-md transition-colors ${videoInputMode === 'url' ? 'bg-blue-500/20 text-blue-400 font-bold' : 'text-gray-500 hover:text-gray-300'}`}>URL Video</button>
                  <button onClick={() => setVideoInputMode('file')} className={`text-[10px] px-2.5 py-1 rounded-md transition-colors ${videoInputMode === 'file' ? 'bg-blue-500/20 text-blue-400 font-bold' : 'text-gray-500 hover:text-gray-300'}`}>Lokal File</button>
                </div>
              </div>
              
              {videoInputMode === 'url' ? (
                <div className="space-y-3">
                  <input 
                    type="url" 
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://discord.com/...mp4" 
                    className="w-full bg-[#09090b] border border-gray-700 rounded-lg px-3 py-2.5 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                  />
                  {videoUrl && (
                    <div className="aspect-video rounded-xl border border-gray-800 overflow-hidden bg-[#09090b]">
                      <video src={videoUrl} className="w-full h-full object-cover" autoPlay muted loop onError={(e) => e.target.style.display = 'none'} />
                    </div>
                  )}
                </div>
              ) : (
                <div 
                  onClick={() => videoInputRef.current?.click()}
                  className={`relative group cursor-pointer aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center overflow-hidden transition-all ${
                    videoPreview ? 'border-blue-500/50' : 'border-gray-700 hover:border-blue-500/50 hover:bg-[#18181b]'
                  }`}
                >
                  <input type="file" ref={videoInputRef} className="hidden" accept="video/*" onChange={handleVideoChange} />
                  {videoPreview ? (
                    <>
                      <video src={videoPreview} className="w-full h-full object-cover" autoPlay muted loop />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                        <span className="text-white text-sm font-medium bg-black/50 px-3 py-1.5 rounded-lg">Ganti Video</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-center p-4">
                      <UploadCloud className="w-8 h-8 text-gray-500 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                      <p className="text-sm text-gray-300 font-medium">Unggah video</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button 
              onClick={handleGenerate}
              disabled={isGenerating || (!imageUrl && !imagePreview) || (!videoUrl && !videoPreview) || !apiKey}
              className={`w-full py-4 rounded-xl font-bold text-sm md:text-base flex items-center justify-center gap-2 transition-all duration-300 ${
                isGenerating 
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700' 
                  : (!imageUrl && !imagePreview) || (!videoUrl && !videoPreview) || !apiKey
                    ? 'bg-[#18181b] text-gray-600 border border-gray-800 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-[0_0_20px_rgba(147,51,234,0.3)] hover:shadow-[0_0_30px_rgba(147,51,234,0.5)] border border-purple-500/50'
              }`}
            >
              {isGenerating ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Sedang Diproses...</>
              ) : (
                <><Wand2 className="w-5 h-5" /> Generate Motion</>
              )}
            </button>
          </div>

          {}
          <div className="lg:col-span-2">
            <div className="bg-[#121214] border border-gray-800 rounded-2xl p-2 md:p-4 h-full min-h-[450px] flex flex-col relative overflow-hidden">
              
              <div className="flex items-center justify-between p-3 md:p-4 border-b border-gray-800/50 mb-4">
                <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                  <PlayCircle className="w-4 h-4 text-emerald-400" />
                  Kling Output Viewer
                </h3>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center p-4">
                
                {errorMsg && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-300 text-sm p-4 rounded-xl flex flex-col items-start gap-2 w-full max-w-lg animate-in fade-in zoom-in duration-300 shadow-xl">
                    <div className="flex items-center gap-2 font-bold text-red-400">
                      <AlertCircle className="w-5 h-5" />
                      Kegagalan Sistem / Jaringan
                    </div>
                    <p className="leading-relaxed opacity-90">{errorMsg}</p>
                  </div>
                )}

                {isGenerating && (
                  <div className="text-center flex flex-col items-center justify-center w-full max-w-md animate-in fade-in duration-500 h-full">
                    <div className="relative mb-6">
                      <div className="w-20 h-20 border-4 border-gray-800 border-t-purple-500 border-l-blue-500 rounded-full animate-spin"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Wand2 className="w-8 h-8 text-purple-400 animate-pulse" />
                      </div>
                    </div>
                    <p className="text-sm font-medium text-gray-200 mb-3 animate-pulse">Menghubungi Magnific AI...</p>
                    <p className="text-xs text-gray-400 bg-[#09090b] border border-gray-800 py-3 px-5 rounded-xl font-mono shadow-inner text-center w-full">
                      {progressText}
                    </p>
                  </div>
                )}

                {resultVideo && !isGenerating && (
                  <div className="w-full h-full flex flex-col animate-in fade-in zoom-in duration-500">
                    <div className="flex items-center justify-center gap-2 text-emerald-400 mb-4 bg-emerald-500/10 py-2 px-4 rounded-full w-fit mx-auto border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="text-sm font-bold tracking-wide">SUCCESSFULLY GENERATED</span>
                    </div>
                    <div className="relative flex-1 w-full bg-black rounded-xl overflow-hidden border border-gray-700 shadow-2xl">
                      <video src={resultVideo} className="absolute inset-0 w-full h-full object-contain" controls autoPlay loop />
                    </div>
                    <div className="mt-4 flex justify-center">
                       <a href={resultVideo} download="Kling_Motion.mp4" target="_blank" rel="noreferrer" className="text-sm font-medium bg-[#18181b] hover:bg-gray-800 text-gray-300 border border-gray-700 py-3 px-6 rounded-xl transition-colors shadow-lg hover:text-white">
                         Buka & Unduh Video HD
                       </a>
                    </div>
                  </div>
                )}

                {!isGenerating && !resultVideo && !errorMsg && (
                  <div className="text-center text-gray-600 flex flex-col items-center">
                    <Video className="w-16 h-16 mb-4 opacity-30" strokeWidth={1} />
                    <p className="text-sm">Silakan masukkan foto, video, dan API Key Magnific,<br/>lalu tekan "Generate Motion"</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}