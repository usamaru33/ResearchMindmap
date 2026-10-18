import { describe, expect, it } from 'vitest';
import { splitReferences } from './referenceList';

describe('splitReferences', () => {
  it('splits numbered lists and joins wrapped lines', () => {
    const text = [
      'References',
      '[1] A. Vaswani, N. Shazeer, N. Parmar et al., “Attention is all you',
      'need,” in Proc. NeurIPS, 2017, pp. 5998–6008.',
      '[2] K. He, X. Zhang, S. Ren, and J. Sun, “Deep residual learning for image recog-',
      'nition,” in Proc. CVPR, 2016. doi: 10.1109/cvpr.2016.',
      '90',
      '',
      '[3] M. Botvinick and J. Cohen, “Rubber hands ‘feel’ touch that eyes see,” Nature, 1998.',
    ].join('\n');
    expect(splitReferences(text)).toEqual([
      'A. Vaswani, N. Shazeer, N. Parmar et al., “Attention is all you need,” in Proc. NeurIPS, 2017, pp. 5998–6008.',
      'K. He, X. Zhang, S. Ren, and J. Sun, “Deep residual learning for image recognition,” in Proc. CVPR, 2016. doi: 10.1109/cvpr.2016.90',
      'M. Botvinick and J. Cohen, “Rubber hands ‘feel’ touch that eyes see,” Nature, 1998.',
    ]);
  });

  it('splits an unnumbered APA list at author lines', () => {
    const text = [
      'He, K., Zhang, X., Ren, S., & Sun, J. (2016). Deep residual learning for image',
      'recognition. In Proceedings of CVPR (pp. 770-778).',
      'Kilteni, K., Groten, R., & Slater, M. (2012). The sense of embodiment in virtual reality.',
      'Presence, 21(4), 373–387. https://doi.org/10.1162/',
      'PRES_a_00124',
      'Botvinick M, Cohen J. Rubber hands feel touch that eyes see. Nature. 1998;391(6669):756.',
    ].join('\n');
    expect(splitReferences(text)).toEqual([
      'He, K., Zhang, X., Ren, S., & Sun, J. (2016). Deep residual learning for image recognition. In Proceedings of CVPR (pp. 770-778).',
      'Kilteni, K., Groten, R., & Slater, M. (2012). The sense of embodiment in virtual reality. Presence, 21(4), 373–387. https://doi.org/10.1162/PRES_a_00124',
      'Botvinick M, Cohen J. Rubber hands feel touch that eyes see. Nature. 1998;391(6669):756.',
    ]);
  });

  it('uses blank lines when there are no numbers', () => {
    const text = 'Ashish Vaswani, Noam Shazeer. 2017. Attention is all\nyou need. In NeurIPS.\n\nSmith, J. 2020. Another paper. In CHI.\n';
    expect(splitReferences(text)).toEqual([
      'Ashish Vaswani, Noam Shazeer. 2017. Attention is all you need. In NeurIPS.',
      'Smith, J. 2020. Another paper. In CHI.',
    ]);
  });

  it('keeps one entry per line when there are no cues', () => {
    expect(splitReferences('Attention Is All You Need\nDeep Residual Learning for Image Recognition\n10.1145/3313831.3376358')).toEqual([
      'Attention Is All You Need',
      'Deep Residual Learning for Image Recognition',
      '10.1145/3313831.3376358',
    ]);
    expect(splitReferences('  \n')).toEqual([]);
  });
});
