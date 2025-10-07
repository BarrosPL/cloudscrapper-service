const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();

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
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', // ✅ REMOVER image/webp,image/apng
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
          // Configurações para bypass de proteções
          maxRedirects: 5,
          validateStatus: function (status) {
            return status >= 200 && status < 400; // Aceitar redirects
          }
        });

        // Se chegou aqui, a requisição foi bem-sucedida
        break;

      } catch (error) {
        console.log(`❌ Tentativa ${attempts} falhou:`, error.message);
        
        if (attempts === maxAttempts) {
          throw error;
        }
        
        // Aguardar antes da próxima tentativa
        await new Promise(resolve => setTimeout(resolve, 2000 * attempts));
      }
    }

    console.log('✅ CloudScraper respondeu:', response.status);

    if (response.status === 200 && response.data) {
      console.log('📝 Processando HTML, tamanho:', response.data.length);
      
      // ✅ PROCESSAMENTO MELHORADO PARA IGNORAR RECURSOS DESNECESSÁRIOS
      const text = response.data
        // Remover tags de mídia e recursos desnecessários
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
        .replace(/<img[^>]*>/gi, ' ') // ✅ REMOVER IMAGENS
        .replace(/<video[^>]*>.*?<\/video>/gi, ' ') // ✅ REMOVER VÍDEOS
        .replace(/<audio[^>]*>.*?<\/audio>/gi, ' ') // ✅ REMOVER ÁUDIO
        .replace(/<source[^>]*>/gi, ' ') // ✅ REMOVER SOURCES
        .replace(/<track[^>]*>/gi, ' ') // ✅ REMOVER TRACKS
        .replace(/<iframe[^>]*>.*?<\/iframe>/gi, ' ') // ✅ REMOVER IFRAMES
        .replace(/<object[^>]*>.*?<\/object>/gi, ' ') // ✅ REMOVER OBJECTS
        .replace(/<embed[^>]*>/gi, ' ') // ✅ REMOVER EMBEDS
        .replace(/<canvas[^>]*>.*?<\/canvas>/gi, ' ') // ✅ REMOVER CANVAS
        .replace(/<svg[^>]*>.*?<\/svg>/gi, ' ') // ✅ REMOVER SVGs
        .replace(/<picture[^>]*>.*?<\/picture>/gi, ' ') // ✅ REMOVER PICTURES
        // Remover outras tags HTML
        .replace(/<[^>]*>/g, ' ')
        // Limpar espaços
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 50000);

      // ✅ EXTRAIR LINKS FILTRANDO ARQUIVOS BAIXÁVEIS
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

      // ✅ PROCESSAR LINKS IGNORANDO ARQUIVOS BAIXÁVEIS
      const processedLinks = allMatches
        .map(link => {
          try {
            let cleanLink = link.split('#')[0].split('?')[0];
            
            // ✅ IGNORAR LINKS DE ARQUIVOS BAIXÁVEIS E RECURSOS DESNECESSÁRIOS
            const downloadExtensions = [
              '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg',
              '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm',
              '.mp3', '.wav', '.ogg', '.m4a',
              '.pdf', '.zip', '.rar', '.7z', '.tar', '.gz',
              '.exe', '.dmg', '.pkg', '.deb', '.rpm'
            ];
            
            const isDownloadable = downloadExtensions.some(ext => 
              cleanLink.toLowerCase().endsWith(ext)
            );
            
            if (cleanLink.startsWith('javascript:') || 
                cleanLink.startsWith('mailto:') || 
                cleanLink.startsWith('tel:') ||
                cleanLink.startsWith('data:') ||
                cleanLink.trim() === '' ||
                cleanLink === '/' ||
                cleanLink === '#' ||
                isDownloadable) { // ✅ FILTRAR ARQUIVOS BAIXÁVEIS
              return null;
            }

            // Resolver URLs relativas
            if (cleanLink.startsWith('/')) {
              const urlObj = new URL(url);
              return urlObj.origin + cleanLink;
            }
            
            // Se já é URL absoluta
            if (cleanLink.startsWith('http')) {
              return cleanLink;
            }
            
            // URLs relativas sem barra
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
            
            return isSameDomain || isCommonDomain;
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
    
    // Detectar tipo de erro
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

// ✅ Endpoint batch ATUALIZADO
app.post('/scrape-batch', async (req, res) => {
  const { urls, instructions } = req.body;
  
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ 
      success: false, 
      error: 'Array de URLs é obrigatório' 
    });
  }

  try {
    console.log(`📦 Processando lote com ${urls.length} URLs`);
    console.log(`📝 Instruções do lote: ${instructions}`);
    
    const urlsToProcess = urls.slice(0, 5); // Limitar para teste
    const results = [];

    // Processar sequencialmente para evitar bloqueios
    for (let i = 0; i < urlsToProcess.length; i++) {
      const url = urlsToProcess[i];
      
      try {
        console.log(`🌐 [${i + 1}/${urlsToProcess.length}] Processando: ${url}`);
        
        // ✅ Reutilizar a lógica do endpoint individual com as mesmas instruções
        const response = await axios.post(`http://localhost:${PORT}/scrape`, {
          url: url,
          instructions: instructions // ✅ PASSAR AS INSTRUÇÕES
        }, {
          timeout: 35000
        });

        if (response.data.success) {
          results.push({
            success: true,
            url: url,
            mainContent: response.data.mainContent,
            contentLength: response.data.contentLength,
            links: response.data.links,
            instructions: instructions // ✅ INCLUIR INSTRUÇÕES NA RESPOSTA
          });
        } else {
          results.push({
            success: false,
            url: url,
            error: response.data.error,
            instructions: instructions // ✅ INCLUIR INSTRUÇÕES NA RESPOSTA
          });
        }

      } catch (error) {
        console.log(`❌ Erro em ${url}:`, error.message);
        results.push({
          success: false,
          url: url,
          error: error.message,
          instructions: instructions // ✅ INCLUIR INSTRUÇÕES NA RESPOSTA
        });
      }

      // Pausa entre requests
      if (i < urlsToProcess.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    const successful = results.filter(r => r.success);
    const combinedContent = successful
      .map(r => `--- ${r.url} ---\n${r.mainContent}`)
      .join('\n\n');

    res.json({
      success: true,
      urlsProcessed: urlsToProcess.length,
      successful: successful.length,
      failed: results.length - successful.length,
      combinedContent: combinedContent,
      totalContentLength: combinedContent.length,
      allResults: results,
      instructions: instructions, // ✅ INCLUIR INSTRUÇÕES NA RESPOSTA FINAL
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('💥 Erro no lote:', error.message);
    res.status(500).json({
      success: false,
      error: 'Erro no lote: ' + error.message,
      instructions: instructions // ✅ INCLUIR INSTRUÇÕES NO ERRO
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🟢 CloudScraper Microservice running on port ${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/`);
  console.log(`🚫 Configurado para ignorar: imagens, vídeos, áudio e arquivos baixáveis`);
  console.log(`📝 Segue instruções da planilha`);
});