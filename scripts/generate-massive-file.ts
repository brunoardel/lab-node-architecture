import path from 'node:path';
import { gerarArquivoEspacial } from '../src/domain/gerador-dados-espaciais.js';

async function main() {
  const args = process.argv.slice(2);
  let tamanhoMb = 50;

  for (const arg of args) {
    if (arg.startsWith('--size=')) {
      const val = parseInt(arg.replace('--size=', ''), 10);
      if (!isNaN(val) && val > 0) {
        tamanhoMb = val;
      }
    }
  }

  const caminhoDestino = path.resolve(
    process.cwd(),
    'data',
    `dados-espaciais-${tamanhoMb}mb.ndjson`
  );

  console.log('\n================================================================');
  console.log(' 🌐 GERADOR DE DADOS ESPACIAIS MASSIVOS (ARQLAB / GIS)');
  console.log('================================================================');
  console.log(` 🎯 Tamanho alvo: ${tamanhoMb} MB`);
  console.log(` 📁 Destino: ${caminhoDestino}\n`);

  const resultado = await gerarArquivoEspacial({
    caminhoArquivo: caminhoDestino,
    tamanhoAlvoBytes: tamanhoMb * 1024 * 1024,
    onProgresso: ({ porcentagem, bytesEscritos, totalAlvo }) => {
      const mbEscritos = (bytesEscritos / 1024 / 1024).toFixed(1);
      const mbTotal = (totalAlvo / 1024 / 1024).toFixed(1);
      process.stdout.write(`\r ⏳ Progresso: [${porcentagem}%] - ${mbEscritos} MB de ${mbTotal} MB gravados...`);
    },
  });

  console.log('\n\n ✅ Arquivo gerado com sucesso!');
  console.log(`    - Total de bytes: ${resultado.totalBytes.toLocaleString('pt-BR')} bytes (${resultado.tamanhoMb} MB)`);
  console.log(`    - Total de registros espaciais: ${resultado.totalRegistros.toLocaleString('pt-BR')} pontos`);
  console.log(`    - Tempo de geração: ${resultado.tempoMs} ms`);
  console.log(`    - Taxa de escrita: ${((resultado.tamanhoMb / (resultado.tempoMs / 1000))).toFixed(2)} MB/s`);
  console.log('================================================================\n');
}

main().catch((erro) => {
  console.error('\n❌ Erro durante a geração do arquivo massivo:', erro);
  process.exit(1);
});
