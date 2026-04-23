import { Entity, Column, CreateDateColumn, PrimaryGeneratedColumn } from 'typeorm';

@Entity('profiles')
export class Profile {
   @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column()
  gender: string;

  @Column('float')
  gender_probability: number;

  @Column('int')
  sample_size: number;

  @Column('int')
  age: number;

  @Column()
  age_group: string;

  @Column()
  country_id: string;

  @Column({nullable:true})
  country_name: string;

  @Column('float')
  country_probability: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
