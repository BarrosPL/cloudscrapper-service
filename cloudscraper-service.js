const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001; // ✅ MOVIDO para o TOPO

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health Check
app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    service: 'CloudScraper Microservice',
    timestamp: new Date().toISOString()
  });
});

// Endpoint principal de scraping
app.post('/scrape', async (req, res) => {
  console.log('📥 Recebendo requisição de scraping...');
  
  const { url, instructions } = req.body;
  
  // Validação
  if (!url) {
    return res.status(400).json({ 
      success: false, 
      error: 'URL é obrigatória' 
    });
  }

  try {
    console.log('🚀 Iniciando CloudScraper para:', url);
    console.log('📝 Instruções:', instructions);
    
    // Configurações do CloudScraper
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];

    const headers = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)]
    };

    console.log('📤 Fazendo requisição com headers otimizados...');
    
    // Fazer a requisição com retry logic
    let response;
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      try {
        attempts++;
        console.log(`🔄 Tentativa ${attempts}/${maxAttempts}`);
        
        response = await axios.get(url, {
          headers: headers,
          timeout: 30000,
          responseType: 'text',
          maxRedirects: 5,
          validateStatus: function (status) {
            return status >= 200 && status < 400;
          }
        });

        break;

      } catch (error) {
        console.log(`❌ Tentativa ${attempts} falhou:`, error.message);
        
        if (attempts === maxAttempts) {
          throw error;
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000 * attempts));
      }
    }

    console.log('✅ CloudScraper respondeu:', response.status);

    if (response.status === 200 && response.data) {
      console.log('📝 Processando HTML, tamanho:', response.data.length);
      
      // PROCESSAMENTO DO HTML
      const text = response.data
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
        .replace(/<link[^>]*>/gi, ' ')
        .replace(/<meta[^>]*>/gi, ' ')
        .replace(/<img[^>]*>/gi, ' ')
        .replace(/<video[^>]*>.*?<\/video>/gi, ' ')
        .replace(/<audio[^>]*>.*?<\/audio>/gi, ' ')
        .replace(/<source[^>]*>/gi, ' ')
        .replace(/<track[^>]*>/gi, ' ')
        .replace(/<iframe[^>]*>.*?<\/iframe>/gi, ' ')
        .replace(/<object[^>]*>.*?<\/object>/gi, ' ')
        .replace(/<embed[^>]*>/gi, ' ')
        .replace(/<canvas[^>]*>.*?<\/canvas>/gi, ' ')
        .replace(/<svg[^>]*>.*?<\/svg>/gi, ' ')
        .replace(/<picture[^>]*>.*?<\/picture>/gi, ' ')
        .replace(/<noscript[^>]*>.*?<\/noscript>/gi, ' ')
        .replace(/<template[^>]*>.*?<\/template>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 50000);

      // EXTRAIR LINKS
      console.log('🔍 Extraindo links...');
      
      const linkPatterns = [
        /href=["']([^"']+)["']/gi,
        /src=["']([^"']+)["']/gi,
        /action=["']([^"']+)["']/gi
      ];

      const allMatches = [];
      
      linkPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(response.data)) !== null) {
          allMatches.push(match[1]);
        }
      });

      console.log(`📎 Links brutos encontrados: ${allMatches.length}`);

      // PROCESSAR LINKS
      const processedLinks = allMatches
        .map(link => {
          try {
            let cleanLink = link.split('#')[0].split('?')[0];
            
            const ignoredExtensions = [
              '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.tiff', '.tif',
              '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mkv', '.3gp',
              '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.wma',
              '.pdf', '.zip', '.rar', '.7z', '.tar', '.gz', '.iso', '.dmg',
              '.exe', '.msi', '.dmg', '.pkg', '.deb', '.rpm', '.apk',
              '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt',
              '.ttf', '.otf', '.woff', '.woff2', '.eot',
              '.css', '.less', '.scss', '.sass',
              'favicon.ico', 'favicon.png'
            ];
            
            const isIgnored = ignoredExtensions.some(ext => 
              cleanLink.toLowerCase().includes(ext) ||
              cleanLink.toLowerCase().endsWith(ext) ||
              cleanLink.toLowerCase().includes('favicon') ||
              cleanLink.toLowerCase().includes('/css/') ||
              cleanLink.toLowerCase().includes('.css?') ||
              cleanLink.toLowerCase().includes('fonts.googleapis.com') ||
              cleanLink.toLowerCase().includes('fonts.gstatic.com')
            );
            
            if (cleanLink.startsWith('javascript:') || 
                cleanLink.startsWith('mailto:') || 
                cleanLink.startsWith('tel:') ||
                cleanLink.startsWith('data:') ||
                cleanLink.trim() === '' ||
                cleanLink === '/' ||
                cleanLink === '#' ||
                isIgnored) {
              return null;
            }

            // Resolver URLs relativas
            if (cleanLink.startsWith('/')) {
              const urlObj = new URL(url);
              return urlObj.origin + cleanLink;
            }
            
            if (cleanLink.startsWith('http')) {
              return cleanLink;
            }
            
            if (!cleanLink.startsWith('http') && !cleanLink.startsWith('/')) {
              const urlObj = new URL(url);
              if (cleanLink.includes('.') || cleanLink.length > 3) {
                const basePath = urlObj.pathname.endsWith('/') ? urlObj.pathname : urlObj.pathname + '/';
                return urlObj.origin + basePath + cleanLink;
              }
            }

            return null;
          } catch (e) {
            return null;
          }
        })
        .filter(link => {
          if (!link) return false;
          try {
            const linkObj = new URL(link);
            const originalObj = new URL(url);
            
            const isSameDomain = linkObj.hostname === originalObj.hostname;
            const isCommonDomain = linkObj.hostname.includes('.com') || 
                                 linkObj.hostname.includes('.org') || 
                                 linkObj.hostname.includes('.net');
            
            const isResourceDomain = 
              linkObj.hostname.includes('fonts.googleapis.com') ||
              linkObj.hostname.includes('fonts.gstatic.com') ||
              linkObj.hostname.includes('cdnjs.cloudflare.com') ||
              linkObj.hostname.includes('stackpath.bootstrapcdn.com') ||
              linkObj.hostname.includes('maxcdn.bootstrapcdn.com') ||
              linkObj.hostname.includes('ajax.googleapis.com');
            
            return (isSameDomain || isCommonDomain) && !isResourceDomain;
          } catch (e) {
            return false;
          }
        })
        .filter((link, index, array) => array.indexOf(link) === index)
        .slice(0, 10);

      console.log(`🎯 Links processados (filtrados): ${processedLinks.length}`);

      return res.json({
        url: url,
        instructions: instructions || '',
        success: true,
        method: 'cloudscraper',
        mainContent: text,
        links: processedLinks,
        contentLength: text.length,
        linksFound: processedLinks.length,
        attemptsUsed: attempts,
        timestamp: new Date().toISOString()
      });
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

  } catch (error) {
    console.log('❌ CloudScraper error:', error.message);
    
    let errorType = 'unknown';
    if (error.code === 'ECONNABORTED') errorType = 'timeout';
    if (error.response?.status === 403) errorType = 'blocked';
    if (error.response?.status === 429) errorType = 'rate_limit';
    if (error.response?.status === 503) errorType = 'service_unavailable';
    
    return res.json({
      url: url,
      instructions: instructions || '',
      success: false,
      error: 'CloudScraper failed: ' + error.message,
      errorType: errorType,
      method: 'cloudscraper',
      timestamp: new Date().toISOString()
    });
  }
});

// ✅✅✅ Endpoint batch CORRIGIDO
app.post('/scrape-batch', async (req, res) => {
  const { urls, instructions, main_url } = req.body;
  
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ 
      success: false, 
      error: 'Array de URLs é obrigatório' 
    });
  }

  try {
    console.log(`📦 Processando lote com ${urls.length} URLs`);
    console.log(`📝 Instruções: ${instructions}`);
    console.log(`🌐 URL principal: ${main_url}`);
    
    // ✅ REDUZIR para evitar timeout
    const urlsToProcess = urls.slice(0, 3);
    const results = [];

    // ✅ PROCESSAR SEQUENCIALMENTE COM MELHOR TRATAMENTO
    for (let i = 0; i < urlsToProcess.length; i++) {
      const url = urlsToProcess[i];
      
      try {
        console.log(`🔄 [${i + 1}/${urlsToProcess.length}] Processando: ${url}`);
        
        // ✅ CORREÇÃO: Usar localhost:3001 fixo (PORT já definido no topo)
        const response = await axios.post(`http://localhost:3001/scrape`, {
          url: url,
          instructions: instructions
        }, {
          timeout: 45000 // ✅ AUMENTAR TIMEOUT
        });

        if (response.data.success) {
          console.log(`✅ Sucesso: ${url}`);
          results.push({
            success: true,
            url: url,
            mainContent: response.data.mainContent,
            contentLength: response.data.contentLength,
            links: response.data.links,
            instructions: instructions
          });
        } else {
          console.log(`❌ Falha no scraping: ${url} - ${response.data.error}`);
          results.push({
            success: false,
            url: url,
            error: response.data.error,
            instructions: instructions
          });
        }

      } catch (error) {
        console.log(`💥 Erro HTTP em ${url}:`, error.message);
        results.push({
          success: false,
          url: url,
          error: `HTTP Error: ${error.message}`,
          instructions: instructions
        });
      }

      // ✅ PAUSA MAIOR ENTRE REQUESTS
      if (i < urlsToProcess.length - 1) {
        console.log('⏳ Aguardando 3 segundos...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    const successful = results.filter(r => r.success);
    console.log(`📊 Resultado: ${successful.length}/${urlsToProcess.length} sucessos`);

    // ✅ MELHOR COMBINAÇÃO DE CONTEÚDO
    const combinedContent = successful.length > 0 
      ? successful.map(r => `--- URL: ${r.url} ---\n${r.mainContent}`).join('\n\n')
      : 'Nenhum conteúdo extraído com sucesso';

    res.json({
      success: successful.length > 0,
      urlsProcessed: urlsToProcess.length,
      successful: successful.length,
      failed: results.length - successful.length,
      combinedContent: combinedContent,
      totalContentLength: combinedContent.length,
      allResults: results,
      instructions: instructions,
      main_url: main_url, // ✅ MANTER URL PRINCIPAL
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('💥 Erro crítico no lote:', error.message);
    res.status(500).json({
      success: false,
      error: 'Erro no processamento do lote: ' + error.message,
      instructions: instructions
    });
  }
});

// Error handling
app.use((error, req, res, next) => {
  console.error('💥 Erro não tratado:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`🟢 CloudScraper Microservice running on port ${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/`);
  console.log(`🚫 Configurado para ignorar: imagens, vídeos, áudio, CSS, favicon e arquivos baixáveis`);
  console.log(`📝 Segue instruções da planilha`);
});